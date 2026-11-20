import { base64ToBuffer, base64ToJson, bufferToBase64, jsonToBase64 } from './blob';
import {
  clearDeletion, getDeletions, getPages, listBooks, saveBookWithPages,
  saveSyncConfig, deleteBook,
} from './db';
import type {
  CloudBook, CloudBookIndex, CloudManifest, CloudPage, DeletionRecord,
  ScoreBook, ScorePage, SyncConfig,
} from './types';

const MANIFEST_PATH = 'score-library.json';
const API_VERSION = '2022-11-28';

interface GitTreeEntry { path: string; mode: '100644'; type: 'blob'; sha: string | null; }
interface ContentFile { content?: string; sha: string; }

function endpoint(config: SyncConfig, path: string): string {
  return `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}${path}`;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function api<T>(config: SyncConfig, path: string, init: RequestInit = {}, allow404 = false): Promise<T | null> {
  // A freshly created or regenerated GitHub token can take a short while to
  // propagate, during which the API returns a transient 401 "Bad credentials"
  // even though the token is valid. Retry 401s a few times with backoff before
  // giving up, as GitHub recommends for transient auth failures.
  const maxAttempts = 4;
  let lastDetail = '';
  const hasBody = init.body != null;
  // Only send Content-Type on requests that actually carry a JSON body. On a
  // bodyless GET it forces a CORS preflight that iOS Safari handles strictly,
  // which made token requests fail on iPad while desktop browsers tolerated it.
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `token ${config.token}`,
    'X-GitHub-Api-Version': API_VERSION,
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(endpoint(config, path), {
        ...init,
        mode: 'cors',
        cache: 'no-store',
        headers,
      });
    } catch (networkError) {
      // fetch() itself threw: the request never completed (network blocked,
      // CORS rejection, offline, content blocker, etc). Surface the real reason
      // instead of a generic message so the user can see what is blocking it.
      const reason = networkError instanceof Error ? networkError.message : String(networkError);
      if (attempt < maxAttempts) { await wait(attempt * 1200); continue; }
      throw new Error(`네트워크 요청 실패(fetch): ${reason} · 경로 ${path || '저장소'}. 콘텐츠 차단기·추적 방지·VPN을 끄고 다시 시도하세요.`);
    }
    if (allow404 && response.status === 404) return null;
    if (response.ok) {
      if (response.status === 204) return null;
      return response.json() as Promise<T>;
    }
    try { lastDetail = (await response.json()).message ?? ''; } catch { lastDetail = response.statusText; }
    if (response.status === 401 && attempt < maxAttempts) { await wait(attempt * 1500); continue; }
    if (response.status === 401) throw new Error(`토큰 인증 실패(401): ${lastDetail || 'Bad credentials'}. 토큰 상태(Active)와 score_final_data의 Contents 읽기/쓰기 권한을 확인하세요.`);
    if (response.status === 403) throw new Error(`접근 거부(403): ${lastDetail}. score_final_data의 Contents를 Read and write로 설정했는지 확인하세요.`);
    if (response.status === 404) throw new Error(`저장소를 찾을 수 없음(404): ${lastDetail}. 토큰의 저장소 접근 범위(score_final_data)를 확인하세요.`);
    throw new Error(`GitHub 오류 ${response.status}: ${lastDetail}`);
  }
  throw new Error('GitHub 요청에 반복 실패했습니다. 잠시 후 다시 시도해 주세요.');
}

export async function verifyConnection(config: SyncConfig): Promise<{ fullName: string; private: boolean }> {
  // Catch malformed tokens before hitting the API so the user gets a clear hint
  // instead of a generic 401 (the common iPad copy/paste failure mode).
  if (!/^github_pat_[A-Za-z0-9_]+$/.test(config.token)) {
    throw new Error('토큰 형식이 올바르지 않습니다. 복사할 때 공백이나 글자가 빠졌을 수 있어요. github_pat_ 로 시작하는 값을 다시 복사해 붙여넣어 주세요.');
  }
  const repo = await api<{ full_name: string; private: boolean; permissions?: { push?: boolean } }>(config, '');
  if (!repo) throw new Error('저장소를 확인하지 못했습니다.');
  if (!repo.private) throw new Error('악보 데이터 저장소는 반드시 Private 저장소여야 합니다.');
  if (repo.permissions && repo.permissions.push === false) throw new Error('이 토큰에는 Contents 쓰기 권한이 없습니다.');
  return { fullName: repo.full_name, private: repo.private };
}

function emptyManifest(): CloudManifest {
  return { version: 1, updatedAt: new Date(0).toISOString(), books: {}, deleted: {} };
}

async function contentJson<T>(config: SyncConfig, path: string, allow404 = false): Promise<T | null> {
  const file = await api<ContentFile>(config, `/contents/${path}?ref=main`, {}, allow404);
  if (!file?.content) return null;
  return base64ToJson<T>(file.content);
}

async function ensureManifest(config: SyncConfig): Promise<CloudManifest> {
  const existing = await contentJson<CloudManifest>(config, MANIFEST_PATH, true);
  if (existing) return existing;
  const manifest = emptyManifest();
  await api(config, `/contents/${MANIFEST_PATH}`, {
    method: 'PUT',
    body: JSON.stringify({ message: 'Initialize ScoreView library', content: jsonToBase64(manifest), branch: 'main' }),
  });
  return manifest;
}

async function downloadPageData(config: SyncConfig, path: string): Promise<ArrayBuffer> {
  // Resolve the blob SHA via contents metadata, then read it through the Git
  // Blobs API (base64) and decode to an ArrayBuffer. Storing ArrayBuffers (not
  // Blobs) avoids the iOS Safari IndexedDB Blob-corruption bug.
  const meta = await api<{ sha: string }>(config, `/contents/${encodeURI(path)}?ref=main`);
  if (!meta?.sha) throw new Error('악보 페이지 정보를 찾지 못했습니다.');
  const blob = await api<{ content: string; encoding: string }>(config, `/git/blobs/${meta.sha}`);
  if (!blob?.content || blob.encoding !== 'base64') throw new Error('악보 페이지를 내려받지 못했습니다.');
  return base64ToBuffer(blob.content);
}

async function loadCloudBook(config: SyncConfig, index: CloudBookIndex): Promise<CloudBook> {
  const book = await contentJson<CloudBook>(config, index.metadataPath);
  if (!book) throw new Error(`“${index.title}” 메타데이터를 찾지 못했습니다.`);
  return book;
}

async function downloadBook(config: SyncConfig, index: CloudBookIndex, progress: (message: string) => void): Promise<void> {
  const cloud = await loadCloudBook(config, index);
  const { pages: cloudPages, ...book } = cloud;
  const pages: ScorePage[] = [];
  for (let i = 0; i < cloudPages.length; i += 1) {
    const page = cloudPages[i];
    progress(`“${book.title}” 내려받는 중 · ${i + 1}/${cloudPages.length}`);
    pages.push({
      id: page.id, bookId: book.id, order: page.order, name: page.name, mime: page.mime,
      data: await downloadPageData(config, page.path), width: page.width, height: page.height,
      rotation: page.rotation, updatedAt: book.contentUpdatedAt,
    });
  }
  await saveBookWithPages(book as ScoreBook, pages, true);
}

async function createBlob(config: SyncConfig, base64: string): Promise<string> {
  const result = await api<{ sha: string }>(config, '/git/blobs', {
    method: 'POST', body: JSON.stringify({ content: base64, encoding: 'base64' }),
  });
  if (!result) throw new Error('GitHub blob을 만들지 못했습니다.');
  return result.sha;
}

async function commitEntries(config: SyncConfig, entries: GitTreeEntry[], message: string): Promise<void> {
  if (!entries.length) return;
  const ref = await api<{ object: { sha: string } }>(config, '/git/ref/heads/main');
  if (!ref) throw new Error('데이터 저장소의 main 브랜치를 찾지 못했습니다.');
  const commit = await api<{ tree: { sha: string } }>(config, `/git/commits/${ref.object.sha}`);
  if (!commit) throw new Error('현재 Git 트리를 읽지 못했습니다.');
  const tree = await api<{ sha: string }>(config, '/git/trees', {
    method: 'POST', body: JSON.stringify({ base_tree: commit.tree.sha, tree: entries }),
  });
  if (!tree) throw new Error('새 Git 트리를 만들지 못했습니다.');
  const next = await api<{ sha: string }>(config, '/git/commits', {
    method: 'POST', body: JSON.stringify({ message, tree: tree.sha, parents: [ref.object.sha] }),
  });
  if (!next) throw new Error('동기화 커밋을 만들지 못했습니다.');
  await api(config, '/git/refs/heads/main', { method: 'PATCH', body: JSON.stringify({ sha: next.sha, force: false }) });
}

async function cloudPageEntries(
  config: SyncConfig, book: ScoreBook, pages: ScorePage[], existing: CloudBook | null,
  progress: (message: string) => void,
): Promise<{ pages: CloudPage[]; entries: GitTreeEntry[] }> {
  if (existing && existing.contentUpdatedAt === book.contentUpdatedAt) return { pages: existing.pages, entries: [] };
  const entries: GitTreeEntry[] = [];
  const cloudPages: CloudPage[] = [];
  const newPaths = new Set<string>();
  for (let i = 0; i < pages.length; i += 1) {
    progress(`“${book.title}” 올리는 중 · ${i + 1}/${pages.length}`);
    const page = pages[i];
    const path = `books/${book.id}/pages/${String(i + 1).padStart(4, '0')}-${page.id}.jpg`;
    newPaths.add(path);
    const sha = await createBlob(config, bufferToBase64(page.data));
    entries.push({ path, mode: '100644', type: 'blob', sha });
    cloudPages.push({ id: page.id, name: page.name, path, mime: page.mime, width: page.width, height: page.height, rotation: page.rotation, order: i });
  }
  existing?.pages.filter((page) => !newPaths.has(page.path)).forEach((page) => entries.push({ path: page.path, mode: '100644', type: 'blob', sha: null }));
  return { pages: cloudPages, entries };
}

function newer(a: string, b?: string): boolean { return !b || a.localeCompare(b) > 0; }

export interface SyncResult { uploaded: number; downloaded: number; deleted: number; }

export async function synchronize(config: SyncConfig, progress: (message: string) => void): Promise<SyncResult> {
  if (!navigator.onLine) throw new Error('오프라인입니다. 인터넷 연결 후 다시 동기화하세요.');
  await verifyConnection(config);
  progress('비공개 저장소 확인 중…');
  const manifest = await ensureManifest(config);
  const localBooks = await listBooks();
  const localById = new Map(localBooks.map((book) => [book.id, book]));
  const deletions = await getDeletions();
  const deletionById = new Map(deletions.map((item) => [item.id, item]));
  const result: SyncResult = { uploaded: 0, downloaded: 0, deleted: 0 };
  const entries: GitTreeEntry[] = [];
  const clearedDeletions: string[] = [];

  // Apply remote tombstones and download newer/unknown remote books first.
  for (const [id, deletedAt] of Object.entries(manifest.deleted)) {
    const local = localById.get(id);
    if (local && newer(deletedAt, local.updatedAt)) {
      await deleteBook(id, deletedAt, false); localById.delete(id); result.deleted += 1;
    }
  }
  for (const [id, remote] of Object.entries(manifest.books)) {
    const localDeletion = deletionById.get(id);
    if (localDeletion && newer(localDeletion.deletedAt, remote.updatedAt)) continue;
    const local = localById.get(id);
    if (!local || newer(remote.updatedAt, local.updatedAt)) {
      await downloadBook(config, remote, progress); result.downloaded += 1;
      localById.set(id, (await listBooks()).find((book) => book.id === id)!);
      if (localDeletion) { await clearDeletion(id); deletionById.delete(id); }
    }
  }

  // Local deletions win only when they are newer than the cloud book.
  for (const deletion of deletionById.values()) {
    const remote = manifest.books[deletion.id];
    if (remote && !newer(deletion.deletedAt, remote.updatedAt)) { await clearDeletion(deletion.id); continue; }
    if (remote) {
      const cloud = await loadCloudBook(config, remote);
      entries.push({ path: remote.metadataPath, mode: '100644', type: 'blob', sha: null });
      cloud.pages.forEach((page) => entries.push({ path: page.path, mode: '100644', type: 'blob', sha: null }));
      delete manifest.books[deletion.id];
    }
    manifest.deleted[deletion.id] = deletion.deletedAt;
    clearedDeletions.push(deletion.id); result.deleted += 1;
  }

  // Upload local books that are newer than their cloud counterpart.
  for (const local of localById.values()) {
    const remote = manifest.books[local.id];
    const remoteDeletedAt = manifest.deleted[local.id];
    if (remoteDeletedAt && newer(remoteDeletedAt, local.updatedAt)) continue;
    if (remote && !newer(local.updatedAt, remote.updatedAt)) continue;
    const existing = remote ? await loadCloudBook(config, remote) : null;
    const pages = await getPages(local.id);
    const pageData = await cloudPageEntries(config, local, pages, existing, progress);
    entries.push(...pageData.entries);
    const metadataPath = `books/${local.id}/book.json`;
    const cloudBook: CloudBook = { ...local, pages: pageData.pages };
    entries.push({ path: metadataPath, mode: '100644', type: 'blob', sha: await createBlob(config, jsonToBase64(cloudBook)) });
    manifest.books[local.id] = {
      id: local.id, title: local.title, updatedAt: local.updatedAt, contentUpdatedAt: local.contentUpdatedAt,
      pageCount: local.pageCount, coverPath: pageData.pages.find((page) => page.id === local.coverPageId)?.path ?? pageData.pages[0]?.path ?? '', metadataPath,
    };
    delete manifest.deleted[local.id]; result.uploaded += 1;
  }

  if (entries.length || clearedDeletions.length) {
    manifest.updatedAt = new Date().toISOString();
    entries.push({ path: MANIFEST_PATH, mode: '100644', type: 'blob', sha: await createBlob(config, jsonToBase64(manifest)) });
    progress('변경 사항을 한 번에 저장하는 중…');
    await commitEntries(config, entries, `Sync ScoreView library (${new Date().toISOString()})`);
    for (const id of clearedDeletions) await clearDeletion(id);
  }
  const finished = new Date().toISOString();
  await saveSyncConfig({ ...config, lastSyncAt: finished, enabled: true });
  return result;
}
