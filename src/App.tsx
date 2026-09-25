import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deleteBook, getPages, listBooks, requestPersistentStorage, saveBookWithPages, updateBook } from './db';
import { importScoreFiles } from './importer';
import { makeId } from './id';
import type { PageDraft, ScoreBook, ScorePage, ViewMode } from './types';

import { SyncPanel, useAutoSync } from './sync-ui';

type Screen = 'library' | 'editor' | 'viewer' | 'sync';

function useBlobUrl(blob?: Blob): string {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!blob) { setUrl(''); return; }
    const next = URL.createObjectURL(blob); setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

function PageImage({ page, className = '' }: { page: Pick<ScorePage, 'blob' | 'rotation'> | Pick<PageDraft, 'blob' | 'rotation'>; className?: string }) {
  const url = useBlobUrl(page.blob);
  const sideways = page.rotation === 90 || page.rotation === 270;
  return url ? <img className={`${className} ${sideways ? 'sideways' : ''}`} src={url} alt="악보 페이지" draggable={false} style={{ transform: `rotate(${page.rotation}deg)` }} /> : <span className="image-loading">불러오는 중…</span>;
}

function Header({ screen, online, onHome, onSync }: { screen: Screen; online: boolean; onHome: () => void; onSync: () => void }) {
  return <header className="app-header">
    <button className="brand" onClick={onHome}><span>♪</span><strong>ScoreView</strong><small>manual score reader</small></button>
    <div className="badges"><span className="badge saved">● 기기 내 저장</span><span className={`badge ${online ? 'online' : 'offline'}`}>{online ? '동기화 가능' : '오프라인'}</span></div>
    <nav><button className={screen === 'library' ? 'active' : ''} onClick={onHome}>보관함</button><button className={screen === 'sync' ? 'active' : ''} onClick={onSync}>동기화</button></nav>
  </header>;
}

function Cover({ book }: { book: ScoreBook }) {
  const [page, setPage] = useState<ScorePage>();
  useEffect(() => { getPages(book.id).then((pages) => setPage(pages.find((item) => item.id === book.coverPageId) ?? pages[0])); }, [book]);
  return <div className="cover">{page ? <PageImage page={page}/> : <span>♫</span>}</div>;
}

function Library({ books, busy, progress, onImport, onOpen, onEdit, onDelete }: {
  books: ScoreBook[]; busy: boolean; progress: string;
  onImport: (files: File[]) => void; onOpen: (book: ScoreBook) => void; onEdit: (book: ScoreBook) => void; onDelete: (book: ScoreBook) => void;
}) {
  return <main className="library-page">
    <section className="library-intro">
      <div className="eyebrow">YOUR DIGITAL SCORE SHELF</div>
      <h1>피아노 악보 뷰어</h1>
      <p>사진이나 PDF를 한 곡으로 묶어 저장합니다. 연주 중 화면의 좌우를 터치하거나 스와이프해 넘기세요.</p>
      <label className={`import-button ${busy ? 'disabled' : ''}`}>
        <input type="file" accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf" multiple disabled={busy} onChange={(event) => {
          const files = Array.from(event.target.files ?? []); event.currentTarget.value = ''; if (files.length) onImport(files);
        }}/><span>{busy ? '처리 중…' : '＋ 새 악보 가져오기'}</span>
      </label>
      {progress && <div className="notice info">{progress}</div>}
    </section>
    <section className="shelf">
      <div className="shelf-head"><div><span className="section-label">LIBRARY</span><h2>내 악보</h2></div><span>{books.length}곡</span></div>
      {books.length === 0 ? <div className="empty-library"><span>♩</span><strong>아직 저장된 악보가 없습니다</strong><p>JPG, PNG 또는 PDF를 선택해 첫 곡을 추가하세요.</p></div> : <div className="book-grid">
        {books.map((book) => <article className="book-card" key={book.id}>
          <button className="book-open" onClick={() => onOpen(book)}><Cover book={book}/><span className="book-info"><strong>{book.title}</strong><small>{book.pageCount}쪽 · {book.currentPage + 1}쪽까지 봄</small><span className="continue">이어보기 →</span></span></button>
          <div className="book-actions"><button onClick={() => onEdit(book)}>편집</button><button className="danger" onClick={() => onDelete(book)}>삭제</button></div>
        </article>)}
      </div>}
    </section>
  </main>;
}

function Editor({ initialBook, initialPages, onCancel, onSaved, onAddFiles }: {
  initialBook?: ScoreBook; initialPages: PageDraft[]; onCancel: () => void; onSaved: () => void;
  onAddFiles: (files: File[], current: PageDraft[], apply: (pages: PageDraft[]) => void) => void;
}) {
  const [title, setTitle] = useState(initialBook?.title ?? '새 악보');
  const [pages, setPages] = useState(initialPages);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= pages.length || from === to) return;
    const next = [...pages]; const [item] = next.splice(from, 1); next.splice(to, 0, item); setPages(next);
  };
  const rotate = (index: number) => setPages((current) => current.map((page, i) => i === index ? { ...page, rotation: ((page.rotation + 90) % 360) as PageDraft['rotation'] } : page));
  const save = async () => {
    if (!title.trim()) return alert('곡 제목을 입력해 주세요.');
    if (!pages.length) return alert('페이지가 한 장 이상 필요합니다.');
    const now = new Date().toISOString();
    const id = initialBook?.id ?? makeId('book');
    const book: ScoreBook = {
      id, title: title.trim(), createdAt: initialBook?.createdAt ?? now, updatedAt: now, contentUpdatedAt: now,
      lastOpenedAt: initialBook?.lastOpenedAt ?? now, currentPage: Math.min(initialBook?.currentPage ?? 0, pages.length - 1),
      pageCount: pages.length, coverPageId: pages[0].id, viewMode: initialBook?.viewMode ?? 'page',
    };
    const stored: ScorePage[] = pages.map((page, order) => ({ ...page, bookId: id, order, mime: page.blob.type || 'image/jpeg', updatedAt: now }));
    await saveBookWithPages(book, stored); onSaved();
  };
  return <main className="editor-page">
    <div className="editor-head"><div><span className="section-label">PAGE ORGANIZER</span><h1>{initialBook ? '악보 편집' : '새 악보 만들기'}</h1><p>페이지를 드래그하거나 화살표로 순서를 바꾸고, 잘못 돌아간 사진은 회전하세요.</p></div><div className="head-actions"><button className="outline" onClick={onCancel}>취소</button><button className="primary" onClick={save}>저장</button></div></div>
    <label className="title-field"><span>곡 제목</span><input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus/></label>
    <div className="organizer-toolbar"><strong>{pages.length}페이지</strong><label className="outline add-pages"><input type="file" accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf" multiple onChange={(event) => { const files = Array.from(event.target.files ?? []); event.currentTarget.value = ''; if (files.length) onAddFiles(files, pages, setPages); }}/>＋ 페이지 추가</label></div>
    <div className="page-grid">
      {pages.map((page, index) => <article className={`page-card ${dragIndex === index ? 'dragging' : ''}`} key={page.id} draggable onDragStart={() => setDragIndex(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragIndex !== null) move(dragIndex, index); setDragIndex(null); }} onDragEnd={() => setDragIndex(null)}>
        <div className="page-preview"><PageImage page={page}/><span className="page-badge">{index + 1}</span></div>
        <div className="page-tools"><button aria-label="앞으로 이동" disabled={index === 0} onClick={() => move(index, index - 1)}>←</button><button aria-label="회전" onClick={() => rotate(index)}>↻</button><button aria-label="뒤로 이동" disabled={index === pages.length - 1} onClick={() => move(index, index + 1)}>→</button><button className="danger" aria-label="페이지 삭제" onClick={() => setPages((current) => current.filter((_, i) => i !== index))}>×</button></div>
        <small>{page.name}</small>
      </article>)}
    </div>
    <div className="editor-bottom"><button className="primary" onClick={save}>이 순서로 저장</button></div>
  </main>;
}

function Viewer({ book: initialBook, pages, onBack, onEdit }: { book: ScoreBook; pages: ScorePage[]; onBack: () => void; onEdit: () => void }) {
  const [book, setBook] = useState(initialBook);
  const [index, setIndex] = useState(Math.min(initialBook.currentPage, pages.length - 1));
  const [mode, setMode] = useState<ViewMode>(initialBook.viewMode);
  const [controls, setControls] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [wake, setWake] = useState<WakeLockSentinel | null>(null);
  const gesture = useRef<{ x: number; y: number; at: number } | null>(null);
  const step = mode === 'spread' ? 2 : 1;
  const pageIndices = mode === 'spread' ? [index, index + 1].filter((value) => value < pages.length) : [index];
  const navigate = useCallback((direction: -1 | 1) => {
    setZoom(1);
    setIndex((current) => Math.max(0, Math.min(pages.length - 1, current + direction * step)));
  }, [pages.length, step]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') navigate(-1);
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.code === 'Space') { event.preventDefault(); navigate(1); }
      if (event.key === 'Escape') onBack();
    };
    addEventListener('keydown', handler); return () => removeEventListener('keydown', handler);
  }, [navigate, onBack]);
  useEffect(() => {
    const now = new Date().toISOString();
    const changed = { ...book, currentPage: index, viewMode: mode, updatedAt: now, lastOpenedAt: now };
    setBook(changed); const timer = setTimeout(() => updateBook(changed), 250); return () => clearTimeout(timer);
    // book is intentionally not a dependency: page turns derive from the initial/current local snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, mode]);
  useEffect(() => {
    const lock = async () => { try { const sentinel = await navigator.wakeLock?.request('screen'); setWake(sentinel ?? null); } catch { setWake(null); } };
    lock(); const visible = () => { if (document.visibilityState === 'visible' && !wake) lock(); }; document.addEventListener('visibilitychange', visible);
    return () => { document.removeEventListener('visibilitychange', visible); wake?.release(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pointerUp = (event: React.PointerEvent) => {
    const start = gesture.current; gesture.current = null; if (!start) return;
    const dx = event.clientX - start.x; const dy = event.clientY - start.y;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.25) { navigate(dx < 0 ? 1 : -1); return; }
    if (Date.now() - start.at > 450 || Math.abs(dx) > 14 || Math.abs(dy) > 14) return;
    const ratio = event.clientX / window.innerWidth;
    if (ratio < .32) navigate(-1); else if (ratio > .68) navigate(1); else setControls((value) => !value);
  };
  return <main className={`viewer ${controls ? 'controls-visible' : ''}`}>
    <div className={`viewer-top ${controls ? '' : 'hidden'}`}><button onClick={onBack}>← 보관함</button><div><strong>{book.title}</strong><span>{index + 1}{mode === 'spread' && pageIndices.length > 1 ? `–${index + 2}` : ''} / {pages.length}</span></div><button onClick={onEdit}>페이지 편집</button></div>
    <div className={`viewer-stage mode-${mode}`} onPointerDown={(event) => { gesture.current = { x: event.clientX, y: event.clientY, at: Date.now() }; }} onPointerUp={pointerUp} onPointerCancel={() => { gesture.current = null; }}>
      <div className="page-surface" style={{ '--zoom': zoom } as React.CSSProperties}>
        {pageIndices.map((pageIndex) => <div className="viewer-sheet" key={pages[pageIndex].id}><PageImage page={pages[pageIndex]}/></div>)}
      </div>
      {index > 0 && <span className="edge-hint left">‹</span>}{index < pages.length - 1 && <span className="edge-hint right">›</span>}
    </div>
    <div className={`viewer-controls ${controls ? '' : 'hidden'}`}>
      <button className="turn" disabled={index === 0} onClick={() => navigate(-1)}>‹</button>
      <div className="viewer-settings"><label>보기<select value={mode} onChange={(event) => { setMode(event.target.value as ViewMode); setZoom(1); }}><option value="page">전체 페이지</option><option value="width">너비 맞춤</option><option value="spread">두 페이지</option></select></label><div className="zoom"><button onClick={() => setZoom((value) => Math.max(1, value - .25))}>−</button><output>{Math.round(zoom * 100)}%</output><button onClick={() => setZoom((value) => Math.min(3, value + .25))}>＋</button></div><input aria-label="페이지 선택" type="range" min="1" max={pages.length} value={index + 1} onChange={(event) => { setZoom(1); setIndex(Number(event.target.value) - 1); }}/></div>
      <button className="turn" disabled={index >= pages.length - 1} onClick={() => navigate(1)}>›</button>
    </div>
  </main>;
}

export function App() {
  const [screen, setScreen] = useState<Screen>('library');
  const [books, setBooks] = useState<ScoreBook[]>([]);
  const [activeBook, setActiveBook] = useState<ScoreBook>();
  const [activePages, setActivePages] = useState<ScorePage[]>([]);
  const [drafts, setDrafts] = useState<PageDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const refresh = useCallback(async () => setBooks(await listBooks()), []);
  const sync = useAutoSync(refresh);
  useEffect(() => { refresh(); requestPersistentStorage(); }, [refresh]);
  useEffect(() => { const update = () => setOnline(navigator.onLine); addEventListener('online', update); addEventListener('offline', update); return () => { removeEventListener('online', update); removeEventListener('offline', update); }; }, []);
  const importFiles = async (files: File[], current: PageDraft[] = [], apply?: (pages: PageDraft[]) => void) => {
    setBusy(true); try { const added = await importScoreFiles(files, setProgress); const next = [...current, ...added]; if (apply) apply(next); else { setDrafts(next); setActiveBook(undefined); setScreen('editor'); } } catch (error) { alert(error instanceof Error ? error.message : '파일을 가져오지 못했습니다.'); } finally { setBusy(false); setProgress(''); }
  };
  const open = async (book: ScoreBook) => { const pages = await getPages(book.id); setActiveBook(book); setActivePages(pages); setScreen('viewer'); };
  const edit = async (book: ScoreBook) => { const pages = await getPages(book.id); setActiveBook(book); setDrafts(pages.map(({ id, name, blob, width, height, rotation }) => ({ id, name, blob, width, height, rotation }))); setScreen('editor'); };
  const remove = async (book: ScoreBook) => { if (!confirm(`“${book.title}” 악보를 삭제할까요? 다른 기기에도 동기화됩니다.`)) return; await deleteBook(book.id); await refresh(); sync.syncNow().catch(() => undefined); };
  const home = async () => { setScreen('library'); setActiveBook(undefined); setActivePages([]); await refresh(); sync.syncNow().catch(() => undefined); };
  return <div className="app-shell">
    {screen !== 'viewer' && <Header screen={screen} online={online} onHome={home} onSync={() => setScreen('sync')}/>} 
    {screen === 'library' && <Library books={books} busy={busy} progress={progress} onImport={importFiles} onOpen={open} onEdit={edit} onDelete={remove}/>} 
    {screen === 'editor' && <Editor initialBook={activeBook} initialPages={drafts} onCancel={home} onSaved={home} onAddFiles={importFiles}/>} 
    {screen === 'viewer' && activeBook && <Viewer book={activeBook} pages={activePages} onBack={home} onEdit={() => edit(activeBook)}/>} 
    {screen === 'sync' && <SyncPanel controller={sync} onSynced={refresh} onBack={home}/>} 
  </div>;
}
