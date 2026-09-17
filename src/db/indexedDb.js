// IndexedDB storage manager for EPUB books, chapters, and summaries

const DB_NAME = 'EpubCompanionDB';
const DB_VERSION = 1;
const STORE_BOOKS = 'books';
const STORE_SETTINGS = 'appSettings';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_BOOKS)) {
        db.createObjectStore(STORE_BOOKS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllBooks() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BOOKS, 'readonly');
    const store = tx.objectStore(STORE_BOOKS);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getBook(id) {
  if (!id) return null;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BOOKS, 'readonly');
    const store = tx.objectStore(STORE_BOOKS);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveBook(book) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BOOKS, 'readwrite');
    const store = tx.objectStore(STORE_BOOKS);
    book.updatedAt = Date.now();
    if (!book.createdAt) book.createdAt = Date.now();
    const req = store.put(book);
    req.onsuccess = () => resolve(book);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteBook(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BOOKS, 'readwrite');
    const store = tx.objectStore(STORE_BOOKS);
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function updateChunkSummary(bookId, chunkId, summaryData) {
  const book = await getBook(bookId);
  if (!book) throw new Error('Book not found: ' + bookId);

  const chunkIndex = book.chunks.findIndex(c => c.id === chunkId);
  if (chunkIndex === -1) throw new Error('Chunk not found: ' + chunkId);

  book.chunks[chunkIndex] = {
    ...book.chunks[chunkIndex],
    ...summaryData,
    lastGeneratedAt: Date.now()
  };

  await saveBook(book);
  return book.chunks[chunkIndex];
}

const DEFAULT_SETTINGS = {
  apiKey: '',
  defaultModel: 'gemini-3.8-flash',
  defaultBrevity: 'indepth',
  defaultChunkSize: 1,
  defaultLanguage: 'en',
  activeBookId: null,
  isMockMode: false,
  hasCompletedOnboarding: false
};

export async function getAppSettings() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SETTINGS, 'readonly');
    const store = tx.objectStore(STORE_SETTINGS);
    const req = store.get('general_settings');
    req.onsuccess = () => {
      resolve(req.result ? { ...DEFAULT_SETTINGS, ...req.result.value } : { ...DEFAULT_SETTINGS });
    };
    req.onerror = () => resolve({ ...DEFAULT_SETTINGS });
  });
}

export async function saveAppSettings(settings) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SETTINGS, 'readwrite');
    const store = tx.objectStore(STORE_SETTINGS);
    const req = store.put({ key: 'general_settings', value: settings });
    req.onsuccess = () => resolve(settings);
    req.onerror = () => reject(req.error);
  });
}
