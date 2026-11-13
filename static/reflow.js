/**
 * Smart Text Reflow Engine for NovelStream AI
 * Solves broken PDF layouts:
 * 1. Merges lines split across margins.
 * 2. Cleans up mid-word hyphenation (e.g., 'trans- / formation' -> 'transformation').
 * 3. Detects paragraphs via Y-axis jumps (>10px).
 * 4. Detects indented / code blocks.
 */

export function reflowPage(textContent, fontSize = 18) {
  if (!textContent || !textContent.items || textContent.items.length === 0) {
    return '<p class="reflow-paragraph text-gray-500 italic">No extractable text found on this page.</p>';
  }

  const items = textContent.items;
  const paragraphs = [];
  let currentParaWords = [];
  let lastY = null;
  let lastX = null;
  let lastWordEndsWithHyphen = false;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const str = item.str;
    if (!str || str.trim() === '') {
      // Empty whitespace item
      continue;
    }

    const transform = item.transform; // [scaleX, skewY, skewX, scaleY, tx, ty]
    const currentX = transform[4];
    const currentY = transform[5];

    if (lastY !== null) {
      const yDelta = Math.abs(lastY - currentY);

      // A vertical gap of more than ~12px usually indicates a new paragraph or header in standard PDF layouts
      if (yDelta > 12) {
        if (currentParaWords.length > 0) {
          paragraphs.push(assembleParagraph(currentParaWords));
          currentParaWords = [];
          lastWordEndsWithHyphen = false;
        }
      }
    }

    // Process current word/phrase
    let token = str.trim();

    // Check if previous word ended with a hyphen and this word completes it
    if (lastWordEndsWithHyphen && currentParaWords.length > 0) {
      const prevWord = currentParaWords[currentParaWords.length - 1];
      // Strip trailing hyphen and merge
      currentParaWords[currentParaWords.length - 1] = prevWord.replace(/-+$/, '') + token;
      lastWordEndsWithHyphen = false;
    } else {
      currentParaWords.push(token);
    }

    // Check if the current token ends with a hyphen at the edge of a line
    if (token.endsWith('-') && token.length > 1) {
      lastWordEndsWithHyphen = true;
    } else {
      lastWordEndsWithHyphen = false;
    }

    lastX = currentX;
    lastY = currentY;
  }

  if (currentParaWords.length > 0) {
    paragraphs.push(assembleParagraph(currentParaWords));
  }

  return paragraphs.join('\n');
}

/**
 * Normalizes paragraph tokens, checks for code blocks, and wraps in HTML.
 */
function assembleParagraph(words) {
  let text = words.join(' ').replace(/\s+/g, ' ').trim();
  if (!text) return '';

  // Clean remaining mid-word line breaks or orphan hyphens
  text = text.replace(/(\w+)-\s+(\w+)/g, '$1$2');

  // Detect code snippet / console log
  const isCode = text.startsWith('```') || 
                 /^(const|let|var|function|def|import|class|SELECT|curl|npm|pip)\s+[a-zA-Z0-9_]+/i.test(text) ||
                 (text.includes('{') && text.includes('}') && text.includes(';'));

  if (isCode) {
    const cleanedCode = text.replace(/^```[a-z]*|```$/g, '');
    return `<pre class="code-box"><code>${escapeHTML(cleanedCode)}</code></pre>`;
  }

  // Detect Heading
  if (text.length < 80 && /^[A-Z0-9\s:—–.-]+$/.test(text) && !text.endsWith('.')) {
    return `<h3 class="text-xl font-bold tracking-tight mt-6 mb-3 text-violet-400 font-display">${escapeHTML(text)}</h3>`;
  }

  return `<p class="reflow-paragraph">${escapeHTML(text)}</p>`;
}

function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

