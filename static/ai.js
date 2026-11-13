/**
 * AI Interactions Module for NovelStream AI
 * Manages Chat with RAG sources, Highlights, Notes synthesis, and Glossary definition.
 */

import { saveHighlight, getHighlightsForBook, deleteHighlight, saveGlossaryItem, getGlossaryForBook } from './db.js';

let currentBookId = null;
let currentBookTitle = '';
let currentChapterText = '';
let currentChapterTitle = '';

export function setAIContext(bookId, bookTitle, chapterText, chapterTitle) {
  currentBookId = bookId;
  currentBookTitle = bookTitle;
  currentChapterText = chapterText;
  currentChapterTitle = chapterTitle;
}

/**
 * Sends a query to the backend RAG Q&A endpoint.
 */
export async function sendChat(query) {
  if (!query || !query.trim()) return null;

  const chatContainer = document.getElementById('chat-messages');
  appendChatMessage('user', query);

  // Loading indicator
  const loadingId = 'loading-' + Date.now();
  appendLoadingMessage(loadingId);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: query.trim(),
        chapter_text: currentChapterText || '',
        chapter_title: currentChapterTitle || '',
        book_title: currentBookTitle || '',
        book_id: currentBookId || ''
      })
    });

    removeChatMessage(loadingId);

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    appendChatMessage('assistant', data.answer, data.sources);
    return data;
  } catch (err) {
    removeChatMessage(loadingId);
    appendChatMessage('assistant', `⚠️ Sorry, unable to complete your question: ${err.message}`);
    return null;
  }
}

function appendChatMessage(role, text, sources = []) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `flex flex-col gap-1.5 ${role === 'user' ? 'items-end' : 'items-start'} animate-fade-in`;

  const bubble = document.createElement('div');
  bubble.className = `rounded-2xl px-4 py-2.5 max-w-[88%] text-sm ${
    role === 'user'
      ? 'bg-violet-600 text-white rounded-br-none'
      : 'bg-gray-800 text-gray-100 border border-gray-700/60 rounded-bl-none shadow-md'
  }`;
  bubble.innerHTML = formatMarkdownLikeText(text);

  msgDiv.appendChild(bubble);

  // Append sources accordion if available
  if (sources && sources.length > 0) {
    const sourceToggle = document.createElement('details');
    sourceToggle.className = 'mt-1 text-xs text-violet-400 cursor-pointer bg-gray-900/60 p-2 rounded border border-gray-800 max-w-[88%]';
    const summary = document.createElement('summary');
    summary.className = 'font-medium select-none flex items-center gap-1';
    summary.innerHTML = `📚 <span>${sources.length} Verified Book Source Chunks</span>`;
    sourceToggle.appendChild(summary);

    const sourceList = document.createElement('div');
    sourceList.className = 'mt-2 space-y-2 text-gray-300 text-xs';
    sources.forEach((src, idx) => {
      const srcItem = document.createElement('div');
      srcItem.className = 'p-2 bg-gray-800/80 rounded border-l-2 border-violet-500';
      srcItem.innerHTML = `<div class="font-semibold text-violet-300">${src.chapter_title || `Chunk #${idx+1}`}</div>
                           <div class="italic text-gray-400 mt-0.5">"${escapeHTML(src.text.slice(0, 160))}..."</div>`;
      sourceList.appendChild(srcItem);
    });
    sourceToggle.appendChild(sourceList);
    msgDiv.appendChild(sourceToggle);
  }

  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

function appendLoadingMessage(id) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const loader = document.createElement('div');
  loader.id = id;
  loader.className = 'flex items-center gap-2 text-gray-400 text-xs py-2 px-3 bg-gray-800/50 rounded-lg max-w-[50%] animate-pulse';
  loader.innerHTML = `<span>Thinking & searching book...</span>`;
  container.appendChild(loader);
  container.scrollTop = container.scrollHeight;
}

function removeChatMessage(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

/**
 * Handle highlighted text actions (Highlight or Define/Glossary)
 */
export async function addHighlight(selectedText, rangeInfo = {}) {
  if (!currentBookId || !selectedText) return;

  const highlight = {
    id: 'hl_' + Date.now(),
    bookId: currentBookId,
    text: selectedText.trim(),
    chapterTitle: currentChapterTitle || 'Chapter',
    note: ''
  };

  await saveHighlight(highlight);
  await renderNotes();
  applyHighlightsToDOM();
}

export async function addToGlossary(term, contextText = '') {
  if (!currentBookId || !term) return;

  const statusToast = showNotification(`Defining "${term}"...`);

  try {
    const res = await fetch('/api/define', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        term: term.trim(),
        context: contextText.slice(0, 300),
        book_title: currentBookTitle || ''
      })
    });

    const data = await res.json();
    const glossaryItem = {
      id: 'gl_' + Date.now(),
      bookId: currentBookId,
      term: data.term,
      definition: data.definition,
      chapterTitle: currentChapterTitle || ''
    };

    await saveGlossaryItem(glossaryItem);
    await renderGlossary();
    showNotification(`Added "${term}" to contextual glossary!`, 'success');
  } catch (err) {
    showNotification(`Failed to define term: ${err.message}`, 'error');
  }
}

export async function renderNotes() {
  const container = document.getElementById('notes-list');
  if (!container || !currentBookId) return;

  const highlights = await getHighlightsForBook(currentBookId);
  container.innerHTML = '';

  if (highlights.length === 0) {
    container.innerHTML = `
      <div class="text-center text-gray-500 py-8 text-sm">
        <p>No highlights yet.</p>
        <p class="text-xs mt-1">Select text in the reader to save highlights and synthesize summaries.</p>
      </div>`;
    return;
  }

  highlights.forEach((hl) => {
    const item = document.createElement('div');
    item.className = 'p-3 bg-gray-800/70 border border-gray-700/60 rounded-xl relative group hover:border-violet-500/40 transition-all';
    item.innerHTML = `
      <div class="text-xs text-violet-400 font-semibold mb-1">${escapeHTML(hl.chapterTitle || 'Passage')}</div>
      <p class="text-xs text-gray-200 italic line-clamp-3">"${escapeHTML(hl.text)}"</p>
      <button data-id="${hl.id}" class="delete-hl-btn absolute top-2 right-2 text-gray-500 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
        ✕
      </button>
    `;

    item.querySelector('.delete-hl-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteHighlight(hl.id);
      renderNotes();
    });

    container.appendChild(item);
  });
}

export async function renderGlossary() {
  const container = document.getElementById('glossary-list');
  if (!container || !currentBookId) return;

  const items = await getGlossaryForBook(currentBookId);
  container.innerHTML = '';

  if (items.length === 0) {
    container.innerHTML = `
      <div class="text-center text-gray-500 py-8 text-sm">
        <p>No glossary entries yet.</p>
        <p class="text-xs mt-1">Select complex jargon in the text and click "Define" to generate instant definitions.</p>
      </div>`;
    return;
  }

  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'p-3 bg-gray-800/80 border border-gray-700/70 rounded-xl space-y-1';
    card.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="font-bold text-violet-300 text-sm">${escapeHTML(item.term)}</span>
        <span class="text-[10px] text-gray-400 uppercase tracking-wider">${escapeHTML(item.chapterTitle || 'Book')}</span>
      </div>
      <p class="text-xs text-gray-300 leading-relaxed">${escapeHTML(item.definition)}</p>
    `;
    container.appendChild(card);
  });
}

export async function synthesizeNotes() {
  if (!currentBookId) return;
  const highlights = await getHighlightsForBook(currentBookId);

  if (highlights.length === 0) {
    showNotification('Highlight at least one passage to synthesize notes.', 'error');
    return;
  }

  const resultContainer = document.getElementById('synthesis-result');
  if (!resultContainer) return;

  resultContainer.classList.remove('hidden');
  resultContainer.innerHTML = '<div class="text-xs text-violet-400 animate-pulse py-2">Synthesizing highlights with AI...</div>';

  try {
    const res = await fetch('/api/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        highlights: highlights.map((h) => h.text),
        book_title: currentBookTitle || ''
      })
    });

    const data = await res.json();
    resultContainer.innerHTML = `
      <div class="bg-violet-950/40 border border-violet-800/50 p-4 rounded-xl text-xs space-y-3">
        <div class="font-bold text-violet-300 uppercase tracking-wider flex items-center gap-1.5">
          ✨ <span>AI Synthesized Takeaways</span>
        </div>
        <p class="text-gray-200 leading-relaxed">${escapeHTML(data.summary)}</p>
        <ul class="space-y-1.5 list-disc list-inside text-gray-300">
          ${(data.takeaways || []).map((t) => `<li>${escapeHTML(t)}</li>`).join('')}
        </ul>
      </div>
    `;
  } catch (err) {
    resultContainer.innerHTML = `<div class="text-xs text-red-400">Synthesis failed: ${err.message}</div>`;
  }
}

export function applyHighlightsToDOM() {
  // Highlights overlay visual update
}

function showNotification(msg, type = 'info') {
  const notif = document.createElement('div');
  notif.className = `fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl shadow-lg text-xs font-medium animate-fade-in ${
    type === 'error'
      ? 'bg-red-600 text-white'
      : type === 'success'
      ? 'bg-emerald-600 text-white'
      : 'bg-violet-600 text-white'
  }`;
  notif.innerText = msg;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 3200);
  return notif;
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatMarkdownLikeText(text) {
  if (!text) return '';
  let formatted = escapeHTML(text);
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
  formatted = formatted.replace(/\n\n/g, '<br/><br/>');
  formatted = formatted.replace(/\n/g, '<br/>');
  return formatted;
}

