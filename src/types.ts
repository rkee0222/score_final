export type ViewMode = 'page' | 'width' | 'spread';

export interface ScoreBook {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  contentUpdatedAt: string;
  lastOpenedAt: string;
  currentPage: number;
  pageCount: number;
  coverPageId: string;
  viewMode: ViewMode;
}

export interface ScorePage {
  id: string;
  bookId: string;
  order: number;
  name: string;
  mime: string;
  // Stored as ArrayBuffer, not Blob: iOS Safari corrupts Blobs kept in IndexedDB
  // across reloads (WebKitBlobResource error), which showed synced pages as "?".
  data: ArrayBuffer;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  updatedAt: string;
}

export interface PageDraft {
  id: string;
  name: string;
  mime: string;
  data: ArrayBuffer;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
}

export interface SyncConfig {
  id: 'github';
  owner: string;
  repo: string;
  token: string;
  enabled: boolean;
  lastSyncAt: string | null;
}

export interface DeletionRecord {
  id: string;
  deletedAt: string;
}

export interface CloudPage {
  id: string;
  name: string;
  path: string;
  mime: string;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  order: number;
}

export interface CloudBook extends Omit<ScoreBook, 'coverPageId'> {
  coverPageId: string;
  pages: CloudPage[];
}

export interface CloudBookIndex {
  id: string;
  title: string;
  updatedAt: string;
  contentUpdatedAt: string;
  pageCount: number;
  coverPath: string;
  metadataPath: string;
}

export interface CloudManifest {
  version: 1;
  updatedAt: string;
  books: Record<string, CloudBookIndex>;
  deleted: Record<string, string>;
}

export type SyncPhase = 'idle' | 'connecting' | 'syncing' | 'success' | 'error';
export interface SyncStatus { phase: SyncPhase; message: string; lastSyncAt: string | null; }
