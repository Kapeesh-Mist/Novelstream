/**
 * IndexedDB Wrapper for NovelStream AI
 * Stores books, chapter structures, bookmarks, and user highlights/glossary items.
 */

const DB_NAME = 'NovelStreamDB';
const DB_VERSION = 1;
const STORE_BOOKS = 'books';
const STORE_HIGHLIGHTS = 'highlights';
const STORE_GLOSSARY = 'glossary';

let dbInstance = null;

export function openDB() {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_BOOKS)) {
        const bookStore = db.createObjectStore(STORE_BOOKS, { keyPath: 'id' });
        bookStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_HIGHLIGHTS)) {
        const highlightStore = db.createObjectStore(STORE_HIGHLIGHTS, { keyPath: 'id' });
        highlightStore.createIndex('bookId', 'bookId', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_GLOSSARY)) {
        const glossaryStore = db.createObjectStore(STORE_GLOSSARY, { keyPath: 'id' });
        glossaryStore.createIndex('bookId', 'bookId', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('Failed to open IndexedDB:', event.target.error);
      reject(event.target.error);
    };
  });
}

export async function saveBook(book) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BOOKS, 'readwrite');
    const store = tx.objectStore(STORE_BOOKS);
    const bookData = {
      ...book,
      updatedAt: Date.now()
    };
    const req = store.put(bookData);
    req.onsuccess = () => resolve(bookData);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function getBook(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BOOKS, 'readonly');
    const store = tx.objectStore(STORE_BOOKS);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function getAllBooks() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BOOKS, 'readonly');
    const store = tx.objectStore(STORE_BOOKS);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function updateBook(id, partial) {
  const existing = await getBook(id);
  if (!existing) return null;
  const updated = { ...existing, ...partial, updatedAt: Date.now() };
  return await saveBook(updated);
}

export async function deleteBook(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_BOOKS, STORE_HIGHLIGHTS, STORE_GLOSSARY], 'readwrite');
    tx.objectStore(STORE_BOOKS).delete(id);

    // Delete associated highlights
    const hlStore = tx.objectStore(STORE_HIGHLIGHTS);
    const hlIndex = hlStore.index('bookId');
    const hlReq = hlIndex.getAll(id);
    hlReq.onsuccess = () => {
      for (const item of hlReq.result || []) {
        hlStore.delete(item.id);
      }
    };

    // Delete associated glossary
    const glStore = tx.objectStore(STORE_GLOSSARY);
    const glIndex = glStore.index('bookId');
    const glReq = glIndex.getAll(id);
    glReq.onsuccess = () => {
      for (const item of glReq.result || []) {
        glStore.delete(item.id);
      }
    };

    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function saveHighlight(highlight) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_HIGHLIGHTS, 'readwrite');
    const store = tx.objectStore(STORE_HIGHLIGHTS);
    const req = store.put({ ...highlight, createdAt: Date.now() });
    req.onsuccess = () => resolve(highlight);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function getHighlightsForBook(bookId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_HIGHLIGHTS, 'readonly');
    const index = tx.objectStore(STORE_HIGHLIGHTS).index('bookId');
    const req = index.getAll(bookId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function deleteHighlight(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_HIGHLIGHTS, 'readwrite');
    const store = tx.objectStore(STORE_HIGHLIGHTS);
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function saveGlossaryItem(item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_GLOSSARY, 'readwrite');
    const store = tx.objectStore(STORE_GLOSSARY);
    const req = store.put({ ...item, createdAt: Date.now() });
    req.onsuccess = () => resolve(item);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function getGlossaryForBook(bookId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_GLOSSARY, 'readonly');
    const index = tx.objectStore(STORE_GLOSSARY).index('bookId');
    const req = index.getAll(bookId);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

