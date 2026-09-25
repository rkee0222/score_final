import { useCallback, useEffect, useRef, useState } from 'react';
import { clearSyncConfig, getSyncConfig, saveSyncConfig } from './db';
import { synchronize, verifyConnection } from './github-sync';
import type { SyncConfig, SyncStatus } from './types';

export interface SyncController {
  config?: SyncConfig;
  ready: boolean;
  status: SyncStatus;
  syncNow: (override?: SyncConfig) => Promise<void>;
  connect: (config: SyncConfig) => Promise<void>;
  disconnect: () => Promise<void>;
}

export function useAutoSync(onSynced: () => void): SyncController {
  const [config, setConfig] = useState<SyncConfig>();
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<SyncStatus>({ phase: 'idle', message: '동기화 설정 전', lastSyncAt: null });
  const running = useRef(false);
  const configRef = useRef<SyncConfig | undefined>(undefined);
  const callback = useRef(onSynced); callback.current = onSynced;

  const rememberConfig = (value?: SyncConfig) => { configRef.current = value; setConfig(value); };
  const syncNow = useCallback(async (override?: SyncConfig) => {
    const active = override ?? configRef.current;
    if (!active?.enabled || running.current) return;
    if (!navigator.onLine) { setStatus({ phase: 'idle', message: '오프라인 · 연결되면 자동 동기화', lastSyncAt: active.lastSyncAt }); return; }
    running.current = true;
    setStatus({ phase: 'syncing', message: '동기화 준비 중…', lastSyncAt: active.lastSyncAt });
    try {
      const result = await synchronize(active, (message) => setStatus({ phase: 'syncing', message, lastSyncAt: active.lastSyncAt }));
      const saved = await getSyncConfig(); if (saved) rememberConfig(saved);
      const detail = [result.uploaded && `${result.uploaded}곡 올림`, result.downloaded && `${result.downloaded}곡 받음`, result.deleted && `${result.deleted}건 삭제`].filter(Boolean).join(' · ') || '변경 없음';
      setStatus({ phase: 'success', message: `동기화 완료 · ${detail}`, lastSyncAt: saved?.lastSyncAt ?? new Date().toISOString() });
      await callback.current();
    } catch (error) {
      setStatus({ phase: 'error', message: error instanceof Error ? error.message : '동기화하지 못했습니다.', lastSyncAt: active.lastSyncAt });
      throw error;
    } finally { running.current = false; }
  }, []);

  const connect = useCallback(async (next: SyncConfig) => {
    setStatus({ phase: 'connecting', message: '비공개 저장소 확인 중…', lastSyncAt: null });
    try {
      await verifyConnection(next); await saveSyncConfig(next); rememberConfig(next); await syncNow(next);
    } catch (error) {
      setStatus({ phase: 'error', message: error instanceof Error ? error.message : '연결하지 못했습니다.', lastSyncAt: null });
      throw error;
    }
  }, [syncNow]);

  const disconnect = useCallback(async () => {
    await clearSyncConfig(); rememberConfig(undefined); setStatus({ phase: 'idle', message: '동기화 설정 전', lastSyncAt: null });
  }, []);

  useEffect(() => {
    let cancelled = false;
    getSyncConfig().then((saved) => {
      if (cancelled) return;
      rememberConfig(saved); setReady(true);
      if (saved?.enabled) {
        setStatus({ phase: 'idle', message: navigator.onLine ? '자동 동기화 대기' : '오프라인 · 로컬 저장 중', lastSyncAt: saved.lastSyncAt });
        setTimeout(() => syncNow(saved).catch(() => undefined), 400);
      }
    });
    return () => { cancelled = true; };
  }, [syncNow]);

  useEffect(() => {
    const resume = () => { const active = configRef.current; if (active?.enabled) syncNow(active).catch(() => undefined); };
    const visible = () => { if (document.visibilityState === 'visible') resume(); };
    addEventListener('online', resume); document.addEventListener('visibilitychange', visible);
    return () => { removeEventListener('online', resume); document.removeEventListener('visibilitychange', visible); };
  }, [syncNow]);

  return { config, ready, status, syncNow, connect, disconnect };
}

function formatSyncTime(value: string | null): string {
  if (!value) return '아직 동기화하지 않음';
  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export function SyncPanel({ controller, onBack }: { controller: SyncController; onSynced: () => void; onBack: () => void }) {
  const [owner, setOwner] = useState(controller.config?.owner ?? 'rkee0222');
  const [repo, setRepo] = useState(controller.config?.repo ?? 'score_final_data');
  const [token, setToken] = useState(controller.config?.token ?? '');
  const [showToken, setShowToken] = useState(false);
  useEffect(() => { if (controller.config) { setOwner(controller.config.owner); setRepo(controller.config.repo); setToken(controller.config.token); } }, [controller.config]);
  const busy = controller.status.phase === 'syncing' || controller.status.phase === 'connecting';
  const connect = async () => {
    if (!owner.trim() || !repo.trim() || !token.trim()) return alert('GitHub 사용자명, 저장소 이름과 토큰을 모두 입력해 주세요.');
    try { await controller.connect({ id: 'github', owner: owner.trim(), repo: repo.trim(), token: token.trim(), enabled: true, lastSyncAt: controller.config?.lastSyncAt ?? null }); }
    catch { /* status already contains the user-facing error */ }
  };
  return <main className="sync-page">
    <button className="back-link" onClick={onBack}>← 보관함</button>
    <div className="sync-card">
      <span className="section-label">PRIVATE GITHUB SYNC</span><h1>기기 간 동기화</h1>
      <p className="sync-lead">악보는 공개 앱 저장소가 아닌 본인의 비공개 저장소에 저장됩니다. 각 기기에서 최초 한 번만 연결하세요.</p>
      <div className={`sync-state ${controller.status.phase}`}><span>{busy ? '↻' : controller.status.phase === 'success' ? '✓' : controller.status.phase === 'error' ? '!' : '●'}</span><div><strong>{controller.status.message}</strong><small>마지막 동기화: {formatSyncTime(controller.status.lastSyncAt)}</small></div></div>
      <div className="sync-form">
        <label><span>GitHub 사용자명</span><input value={owner} onChange={(event) => setOwner(event.target.value)} autoCapitalize="none" spellCheck={false}/></label>
        <label><span>비공개 데이터 저장소</span><input value={repo} onChange={(event) => setRepo(event.target.value)} autoCapitalize="none" spellCheck={false}/></label>
        <label><span>Fine-grained access token</span><div className="token-field"><input type={showToken ? 'text' : 'password'} value={token} onChange={(event) => setToken(event.target.value)} autoCapitalize="none" autoComplete="off" spellCheck={false} placeholder="github_pat_…"/><button onClick={() => setShowToken((value) => !value)}>{showToken ? '숨김' : '보기'}</button></div></label>
      </div>
      <div className="sync-actions">
        {!controller.config ? <button className="primary" disabled={busy} onClick={connect}>{busy ? '연결 중…' : '연결하고 첫 동기화'}</button> : <><button className="primary" disabled={busy || !navigator.onLine} onClick={() => controller.syncNow().catch(() => undefined)}>{busy ? '동기화 중…' : '지금 동기화'}</button><button className="outline" onClick={connect}>연결 정보 갱신</button><button className="text-danger" onClick={async () => { if (confirm('이 기기의 GitHub 연결만 해제할까요? 저장된 악보는 유지됩니다.')) await controller.disconnect(); }}>이 기기 연결 해제</button></>}
      </div>
      <details className="token-guide"><summary>토큰은 어떻게 만드나요?</summary><ol><li>GitHub의 <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">Fine-grained token 만들기</a>를 엽니다.</li><li>Repository access에서 <b>Only select repositories</b> → <b>score_final_data</b>만 선택합니다.</li><li>Repository permissions에서 <b>Contents: Read and write</b>만 지정하고 생성합니다.</li><li>생성 직후 보이는 토큰을 복사해 위 칸에 붙여 넣습니다.</li></ol></details>
      <p className="security-note">🔒 토큰은 이 기기의 IndexedDB에만 저장되며 앱 코드나 공개 저장소로 전송되지 않습니다. Safari 사이트 데이터를 지우거나 토큰을 만료·취소하면 다시 연결해야 합니다.</p>
    </div>
  </main>;
}
