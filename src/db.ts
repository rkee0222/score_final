import type { DeletionRecord, ScoreBook, ScorePage, SyncConfig } from './types';

const DB_NAME = 'score-final-library';
const VERSION = 1;
const BOOKS = 'books';
const PAGES = 'pages';
const SETTINGS = 'settings';
const DELETIONS = 'deletions';

let pendingOpen: Promise<IDBDatabase> | null = null;

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}

function completed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('저장 작업에 실패했습니다.'));
    tx.onabort = () => reject(tx.error ?? new Error('저장 작업이 취소되었습니다.'));
  });
}

export function openDatabase(): Promise<IDBDatabase> {
  if (pendingOpen) return pendingOpen;
  pendingOpen = new Promise((resolve, reject) => {
    const opening = indexedDB.open(DB_NAME, VERSION);
    opening.onupgradeneeded = () => {
      const db = opening.result;
      if (!db.objectStoreNames.contains(BOOKS)) db.createObjectStore(BOOKS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(PAGES)) {
        const pages = db.createObjectStore(PAGES, { keyPath: 'id' });
        pages.createIndex('bookId', 'bookId', { unique: false });
        pages.createIndex('bookOrder', ['bookId', 'order'], { unique: false });
      }
      if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(DELETIONS)) db.createObjectStore(DELETIONS, { keyPath: 'id' });
    };
    opening.onsuccess = () => {
      const db = opening.result;
      db.onversionchange = () => { db.close(); pendingOpen = null; };
      resolve(db);
    };
    opening.onerror = () => { pendingOpen = null; reject(opening.error); };
    opening.onblocked = () => reject(new Error('다른 탭의 ScoreView를 닫고 다시 시도해 주세요.'));
  });
  return pendingOpen;
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}

export async function listBooks(): Promise<ScoreBook[]> {
  const db = await openDatabase();
  const tx = db.transaction(BOOKS, 'readonly');
  const books = await request(tx.objectStore(BOOKS).getAll()) as ScoreBook[];
  return books.sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
}

export async function getBook(id: string): Promise<ScoreBook | undefined> {
  const db = await openDatabase();
  return request(db.transaction(BOOKS).objectStore(BOOKS).get(id)) as Promise<ScoreBook | undefined>;
}

export async function getPages(bookId: string): Promise<ScorePage[]> {
  const db = await openDatabase();
  const tx = db.transaction(PAGES, 'readonly');
  const pages = await request(tx.objectStore(PAGES).index('bookId').getAll(bookId)) as ScorePage[];
  return pages.sort((a, b) => a.order - b.order);
}

export async function saveBookWithPages(book: ScoreBook, pages: ScorePage[], clearDeletion = true): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction([BOOKS, PAGES, DELETIONS], 'readwrite');
  tx.objectStore(BOOKS).put(book);
  const pageStore = tx.objectStore(PAGES);
  const existing = await request(pageStore.index('bookId').getAllKeys(book.id));
  existing.forEach((key) => pageStore.delete(key));
  pages.forEach((page, order) => pageStore.put({ ...page, bookId: book.id, order }));
  if (clearDeletion) tx.objectStore(DELETIONS).delete(book.id);
  await completed(tx);
}

export async function updateBook(book: ScoreBook): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(BOOKS, 'readwrite');
  tx.objectStore(BOOKS).put(book);
  await completed(tx);
}

export async function deleteBook(id: string, deletedAt = new Date().toISOString(), recordDeletion = true): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction([BOOKS, PAGES, DELETIONS], 'readwrite');
  tx.objectStore(BOOKS).delete(id);
  const pages = tx.objectStore(PAGES);
  const keys = await request(pages.index('bookId').getAllKeys(id));
  keys.forEach((key) => pages.delete(key));
  if (recordDeletion) tx.objectStore(DELETIONS).put({ id, deletedAt } satisfies DeletionRecord);
  await completed(tx);
}

export async function getDeletions(): Promise<DeletionRecord[]> {
  const db = await openDatabase();
  return request(db.transaction(DELETIONS).objectStore(DELETIONS).getAll()) as Promise<DeletionRecord[]>;
}

export async function clearDeletion(id: string): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(DELETIONS, 'readwrite');
  tx.objectStore(DELETIONS).delete(id);
  await completed(tx);
}

export async function getSyncConfig(): Promise<SyncConfig | undefined> {
  const db = await openDatabase();
  return request(db.transaction(SETTINGS).objectStore(SETTINGS).get('github')) as Promise<SyncConfig | undefined>;
}

export async function saveSyncConfig(config: SyncConfig): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(SETTINGS, 'readwrite');
  tx.objectStore(SETTINGS).put(config);
  await completed(tx);
}

export async function clearSyncConfig(): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(SETTINGS, 'readwrite');
  tx.objectStore(SETTINGS).delete('github');
  await completed(tx);
}
