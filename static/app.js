/**
 * Core Application Logic for NovelStream AI
 * Handles PDF processing, smart reflow rendering, navigation, and state synchronization.
 */

import { saveBook, getBook, getAllBooks, deleteBook, updateBook } from './db.js';
import { reflowPage } from './reflow.js';
import { setAIContext, sendChat, addHighlight, addToGlossary, renderNotes, renderGlossary, synthesizeNotes } from './ai.js';

// Application State
const state = {
  currentBook: null,
  currentChapterIndex: 0,
  pdfDoc: null,
  chapters: [],
  settings: {
    theme: 'dark',
    fontSize: 18,
    fontFamily: 'serif',
    lineHeight: 1.85
  }
};

// Setup PDF.js worker
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  loadSavedSettings();
  setupEventListeners();
  setupSelectionToolbar();
  await refreshLibrary();
}

function loadSavedSettings() {
  const saved = localStorage.getItem('novelstream_settings');
  if (saved) {
    try {
      state.settings = { ...state.settings, ...JSON.parse(saved) };
    } catch (e) {}
  }
  applySettings();
}

function saveSettings() {
  localStorage.setItem('novelstream_settings', JSON.stringify(state.settings));
  applySettings();
}

function applySettings() {
  document.documentElement.setAttribute('data-theme', state.settings.theme);

  const reflowEl = document.getElementById('reflow-container');
  if (reflowEl) {
    reflowEl.style.fontSize = `${state.settings.fontSize}px`;
    reflowEl.classList.remove('font-sans-mode', 'font-mono-mode');
    if (state.settings.fontFamily === 'sans') {
      reflowEl.classList.add('font-sans-mode');
    } else if (state.settings.fontFamily === 'mono') {
      reflowEl.classList.add('font-mono-mode');
    }
  }

  // Sync settings inputs
  const themeSelect = document.getElementById('setting-theme');
  if (themeSelect) themeSelect.value = state.settings.theme;

  const fontSelect = document.getElementById('setting-font');
  if (fontSelect) fontSelect.value = state.settings.fontFamily;

  const fontSizeInput = document.getElementById('setting-font-size');
  const fontSizeDisplay = document.getElementById('font-size-val');
  if (fontSizeInput) fontSizeInput.value = state.settings.fontSize;
  if (fontSizeDisplay) fontSizeDisplay.innerText = `${state.settings.fontSize}px`;
}

function setupEventListeners() {
  // Navigation / View switches
  document.getElementById('nav-library-btn')?.addEventListener('click', showLibraryView);
  document.getElementById('nav-upload-btn')?.addEventListener('click', () => {
    document.getElementById('pdf-file-input')?.click();
  });
  document.getElementById('pdf-file-input')?.addEventListener('change', handleFileUpload);

  // Sidebars toggle
  document.getElementById('toggle-toc-btn')?.addEventListener('click', toggleTOC);
  document.getElementById('close-toc-btn')?.addEventListener('click', toggleTOC);
  document.getElementById('toggle-ai-btn')?.addEventListener('click', toggleAIPanel);
  document.getElementById('close-ai-btn')?.addEventListener('click', toggleAIPanel);
  document.getElementById('toggle-settings-btn')?.addEventListener('click', toggleSettingsDrawer);
  document.getElementById('close-settings-btn')?.addEventListener('click', toggleSettingsDrawer);

  // Settings inputs
  document.getElementById('setting-theme')?.addEventListener('change', (e) => {
    state.settings.theme = e.target.value;
    saveSettings();
  });
  document.getElementById('setting-font')?.addEventListener('change', (e) => {
    state.settings.fontFamily = e.target.value;
    saveSettings();
  });
  document.getElementById('setting-font-size')?.addEventListener('input', (e) => {
    state.settings.fontSize = parseInt(e.target.value, 10);
    saveSettings();
  });

  // Chapter navigation
  document.getElementById('prev-chapter-btn')?.addEventListener('click', () => {
    if (state.currentChapterIndex > 0) {
      loadChapter(state.currentChapterIndex - 1);
    }
  });
  document.getElementById('next-chapter-btn')?.addEventListener('click', () => {
    if (state.currentChapterIndex < state.chapters.length - 1) {
      loadChapter(state.currentChapterIndex + 1);
    }
  });

  // Chat input
  const chatInput = document.getElementById('chat-query-input');
  const chatSendBtn = document.getElementById('chat-send-btn');
  const doSendChat = () => {
    const q = chatInput.value.trim();
    if (q) {
      sendChat(q);
      chatInput.value = '';
    }
  };
  chatSendBtn?.addEventListener('click', doSendChat);
  chatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSendChat();
    }
  });

  // AI Tab Switcher
  document.querySelectorAll('.ai-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ai-tab-btn').forEach((b) => {
        b.classList.remove('active-tab', 'text-violet-400', 'border-violet-500');
        b.classList.add('text-gray-400');
      });
      btn.classList.add('active-tab', 'text-violet-400', 'border-b-2', 'border-violet-500');
      btn.classList.remove('text-gray-400');

      const targetTab = btn.getAttribute('data-tab');
      document.querySelectorAll('.ai-tab-content').forEach((pane) => {
        pane.classList.add('hidden');
      });
      document.getElementById(`tab-${targetTab}`)?.classList.remove('hidden');

      if (targetTab === 'notes') renderNotes();
      if (targetTab === 'glossary') renderGlossary();
    });
  });

  // Synthesize button
  document.getElementById('synthesize-btn')?.addEventListener('click', synthesizeNotes);
}

/**
 * Text Selection Popover for instant Highlight & Define
 */
function setupSelectionToolbar() {
  const toolbar = document.getElementById('text-selection-toolbar');
  const highlightBtn = document.getElementById('popover-highlight-btn');
  const defineBtn = document.getElementById('popover-define-btn');
  const explainBtn = document.getElementById('popover-explain-btn');

  let selectedText = '';
  let selectionContext = '';

  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !state.currentBook) {
      toolbar.classList.add('hidden');
      return;
    }

    const text = selection.toString().trim();
    if (text.length > 1) {
      selectedText = text;
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Ensure selection is inside reader
      const reader = document.getElementById('reflow-container');
      if (reader && reader.contains(range.commonAncestorContainer)) {
        selectionContext = range.commonAncestorContainer.textContent || '';
        toolbar.style.top = `${window.scrollY + rect.top - 10}px`;
        toolbar.style.left = `${window.scrollX + rect.left + rect.width / 2}px`;
        toolbar.classList.remove('hidden');
      }
    } else {
      toolbar.classList.add('hidden');
    }
  });

  highlightBtn?.addEventListener('click', async () => {
    if (selectedText) {
      await addHighlight(selectedText);
      toolbar.classList.add('hidden');
      window.getSelection()?.removeAllRanges();
    }
  });

  defineBtn?.addEventListener('click', async () => {
    if (selectedText) {
      toolbar.classList.add('hidden');
      await addToGlossary(selectedText, selectionContext);
      openAITab('glossary');
      window.getSelection()?.removeAllRanges();
    }
  });

  explainBtn?.addEventListener('click', async () => {
    if (selectedText) {
      toolbar.classList.add('hidden');
      openAITab('chat');
      sendChat(`Explain the meaning and context of this excerpt:\n"${selectedText}"`);
      window.getSelection()?.removeAllRanges();
    }
  });
}

function openAITab(tabName) {
  const rightSidebar = document.getElementById('right-sidebar');
  if (rightSidebar?.classList.contains('translate-x-full')) {
    toggleAIPanel();
  }
  const tabBtn = document.querySelector(`.ai-tab-btn[data-tab="${tabName}"]`);
  tabBtn?.click();
}

/**
 * File Upload and Extraction
 */
async function handleFileUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  showLoadingScreen(true, 'Extracting text and structure from PDF...');

  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;
    state.pdfDoc = pdfDoc;

    const numPages = pdfDoc.numPages;
    const chapters = [];
    const outline = await pdfDoc.getOutline().catch(() => null);

    updateLoadingStatus(`Parsing ${numPages} pages and outline...`);

    if (outline && outline.length > 0) {
      // Map outline destinations to page indices
      for (let i = 0; i < outline.length; i++) {
        const item = outline[i];
        let pageIdx = 1;
        if (typeof item.dest === 'string') {
          const dest = await pdfDoc.getDestination(item.dest);
          if (dest) {
            pageIdx = (await pdfDoc.getPageIndex(dest[0])) + 1;
          }
        } else if (Array.isArray(item.dest)) {
          pageIdx = (await pdfDoc.getPageIndex(item.dest[0])) + 1;
        }

        chapters.push({
          id: `ch_${i + 1}`,
          title: item.title || `Chapter ${i + 1}`,
          pageStart: pageIdx,
          pageEnd: numPages,
          text: ''
        });
      }

      // Fix chapter end pages
      for (let i = 0; i < chapters.length - 1; i++) {
        chapters[i].pageEnd = Math.max(chapters[i].pageStart, chapters[i + 1].pageStart - 1);
      }
    } else {
      // Auto-chunk pages (e.g. 10 pages per section or single page chunks for short files)
      const chunkSize = numPages <= 15 ? 1 : 10;
      for (let p = 1; p <= numPages; p += chunkSize) {
        const endP = Math.min(p + chunkSize - 1, numPages);
        chapters.push({
          id: `ch_${p}`,
          title: `Pages ${p} - ${endP}`,
          pageStart: p,
          pageEnd: endP,
          text: ''
        });
      }
    }

    // Extract text content for each chapter
    for (let c = 0; c < chapters.length; c++) {
      updateLoadingStatus(`Extracting text for ${chapters[c].title} (${c + 1}/${chapters.length})...`);
      let chapterFullText = '';
      for (let p = chapters[c].pageStart; p <= chapters[c].pageEnd; p++) {
        const page = await pdfDoc.getPage(p);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((i) => i.str).join(' ');
        chapterFullText += pageText + '\n\n';
      }
      chapters[c].text = chapterFullText.trim();
    }

    const bookId = 'book_' + Date.now();
    const bookTitle = file.name.replace(/\.pdf$/i, '');

    const newBook = {
      id: bookId,
      title: bookTitle,
      totalPages: numPages,
      chapters: chapters,
      lastReadChapter: 0,
      createdAt: Date.now()
    };

    await saveBook(newBook);
    state.currentBook = newBook;
    state.chapters = chapters;

    // Trigger vector indexing in backend
    updateLoadingStatus('Embedding book into vector database for cross-chapter Q&A...');
    fetch('/api/index-book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        book_id: bookId,
        book_title: bookTitle,
        chapters: chapters.map((c) => ({
          id: c.id,
          title: c.title,
          text: c.text
        }))
      })
    }).then((res) => res.json())
      .then((data) => console.log('Vector Indexing Complete:', data))
      .catch((err) => console.warn('Indexing error (mock mode active):', err));

    showLoadingScreen(false);
    openReader(newBook, 0);
  } catch (err) {
    showLoadingScreen(false);
    alert('Failed to parse PDF document: ' + err.message);
  }
}

/**
 * Open Reader View
 */
export async function openReader(book, chapterIndex = 0) {
  state.currentBook = book;
  state.chapters = book.chapters || [];
  state.currentChapterIndex = chapterIndex;

  document.getElementById('library-view')?.classList.add('hidden');
  document.getElementById('reader-view')?.classList.remove('hidden');

  document.getElementById('reader-book-title').innerText = book.title;

  buildTableOfContents();
  await loadChapter(chapterIndex);
  await renderNotes();
  await renderGlossary();
}

/**
 * Load Chapter and run Smart Reflow Engine
 */
async function loadChapter(index) {
  if (!state.chapters[index]) return;
  state.currentChapterIndex = index;

  const chapter = state.chapters[index];
  document.getElementById('chapter-heading').innerText = chapter.title;
  document.getElementById('current-chapter-title-header').innerText = chapter.title;
  document.getElementById('progress-indicator').innerText = `Chapter ${index + 1} of ${state.chapters.length}`;

  const reflowContainer = document.getElementById('reflow-container');
  reflowContainer.innerHTML = '<div class="py-12 text-center text-gray-400 animate-pulse">Reflowing text layout...</div>';

  try {
    let renderedHtml = '';

    // If PDF Doc is in memory, re-fetch page items for pixel-accurate reflow calculation
    if (state.pdfDoc && chapter.pageStart) {
      for (let p = chapter.pageStart; p <= chapter.pageEnd; p++) {
        const page = await state.pdfDoc.getPage(p);
        const textContent = await page.getTextContent();
        renderedHtml += reflowPage(textContent, state.settings.fontSize);
      }
    } else {
      // Fallback reflow from plain text
      const fakeItems = chapter.text.split('\n\n').map((para, i) => ({
        str: para,
        transform: [1, 0, 0, 1, 0, 100 - i * 25]
      }));
      renderedHtml = reflowPage({ items: fakeItems }, state.settings.fontSize);
    }

    reflowContainer.innerHTML = renderedHtml;

    // Update AI context
    setAIContext(state.currentBook.id, state.currentBook.title, chapter.text, chapter.title);

    // Save progress to DB
    await updateBook(state.currentBook.id, { lastReadChapter: index });

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Highlight active TOC item
    document.querySelectorAll('.toc-item').forEach((item, idx) => {
      if (idx === index) {
        item.classList.add('bg-violet-600/20', 'text-violet-400', 'font-medium');
      } else {
        item.classList.remove('bg-violet-600/20', 'text-violet-400', 'font-medium');
      }
    });
  } catch (err) {
    reflowContainer.innerHTML = `<div class="p-6 text-red-400">Failed to reflow chapter: ${err.message}</div>`;
  }
}

function buildTableOfContents() {
  const tocList = document.getElementById('toc-list');
  if (!tocList) return;
  tocList.innerHTML = '';

  state.chapters.forEach((ch, idx) => {
    const btn = document.createElement('button');
    btn.className = 'toc-item w-full text-left px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors flex items-center justify-between';
    btn.innerHTML = `<span class="truncate pr-2">${escapeHTML(ch.title)}</span><span class="text-[10px] text-gray-500 font-mono">p.${ch.pageStart || (idx+1)}</span>`;
    btn.addEventListener('click', () => {
      loadChapter(idx);
      if (window.innerWidth < 768) toggleTOC();
    });
    tocList.appendChild(btn);
  });
}

async function refreshLibrary() {
  const container = document.getElementById('books-grid');
  if (!container) return;

  const books = await getAllBooks();
  container.innerHTML = '';

  if (books.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-20 text-center border-2 border-dashed border-gray-800 rounded-3xl p-8">
        <div class="text-5xl mb-4">📚</div>
        <h3 class="text-lg font-semibold text-gray-200">Your Library is Empty</h3>
        <p class="text-sm text-gray-400 mt-1 max-w-md mx-auto">Upload any PDF book or paper to enjoy smart reflow, instant AI definitions, and cross-chapter RAG search.</p>
        <button onclick="document.getElementById('pdf-file-input').click()" class="mt-6 px-6 py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-xl shadow-lg shadow-violet-600/20 transition-all">
          Upload PDF
        </button>
      </div>`;
    return;
  }

  books.forEach((book) => {
    const card = document.createElement('div');
    card.className = 'glass-panel p-5 rounded-2xl flex flex-col justify-between hover:border-violet-500/50 transition-all group relative';
    card.innerHTML = `
      <div>
        <div class="w-12 h-12 bg-violet-600/10 text-violet-400 rounded-xl flex items-center justify-center text-2xl mb-4 group-hover:scale-105 transition-transform">
          📖
        </div>
        <h4 class="font-bold text-gray-100 text-base line-clamp-2">${escapeHTML(book.title)}</h4>
        <div class="text-xs text-gray-400 mt-2 flex items-center gap-3">
          <span>${book.chapters?.length || 0} Chapters</span>
          <span>•</span>
          <span>${book.totalPages || 0} Pages</span>
        </div>
      </div>
      <div class="mt-6 flex items-center justify-between pt-4 border-t border-gray-800">
        <button class="open-book-btn text-xs font-semibold text-violet-400 hover:text-violet-300">
          Read Book →
        </button>
        <button class="delete-book-btn text-xs text-gray-500 hover:text-red-400">
          Delete
        </button>
      </div>
    `;

    card.querySelector('.open-book-btn').addEventListener('click', () => {
      openReader(book, book.lastReadChapter || 0);
    });

    card.querySelector('.delete-book-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Remove "${book.title}" from library?`)) {
        await deleteBook(book.id);
        refreshLibrary();
      }
    });

    container.appendChild(card);
  });
}

function showLibraryView() {
  document.getElementById('reader-view')?.classList.add('hidden');
  document.getElementById('library-view')?.classList.remove('hidden');
  refreshLibrary();
}

function toggleTOC() {
  const sidebar = document.getElementById('left-sidebar');
  sidebar?.classList.toggle('-translate-x-full');
}

function toggleAIPanel() {
  const sidebar = document.getElementById('right-sidebar');
  sidebar?.classList.toggle('translate-x-full');
}

function toggleSettingsDrawer() {
  const drawer = document.getElementById('settings-drawer');
  drawer?.classList.toggle('translate-x-full');
}

function showLoadingScreen(show, text = 'Processing...') {
  const screen = document.getElementById('loading-screen');
  const textEl = document.getElementById('loading-text');
  if (textEl) textEl.innerText = text;
  if (show) {
    screen?.classList.remove('hidden');
  } else {
    screen?.classList.add('hidden');
  }
}

function updateLoadingStatus(text) {
  const textEl = document.getElementById('loading-text');
  if (textEl) textEl.innerText = text;
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

