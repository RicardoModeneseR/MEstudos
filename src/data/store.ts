import { useMemo } from 'react';
import { create } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { nowStamp, uid } from '../lib/ids';
import { COLLECTIONS, type CollectionName, type Collections, type DB, type Settings } from './types';
import { defaultSettings } from './defaults';

type SyncStatus = 'local' | 'synced' | 'syncing' | 'offline' | 'error';
interface QueueItem { c: CollectionName; id: string }

interface RecordRow {
  id: string;
  user_id: string;
  collection: CollectionName;
  data: unknown;
  updated_at: string;
  deleted: boolean;
}

interface State {
  db: DB;
  userId: string | null; // null = modo local
  email: string | null;
  loaded: boolean;
  sync: SyncStatus;
  lastSyncAt: string | null;
}

const emptyDB = (): DB => Object.fromEntries(COLLECTIONS.map((c) => [c, {}])) as unknown as DB;

export const useStore = create<State>(() => ({
  db: emptyDB(),
  userId: null,
  email: null,
  loaded: false,
  sync: 'local',
  lastSyncAt: null,
}));

/* ---------- persistência local ---------- */

const scope = () => useStore.getState().userId ?? 'local';
const dbKey = () => `mestudos:db:${scope()}`;
const queueKey = () => `mestudos:queue:${scope()}`;
const pulledKey = () => `mestudos:pulled:${scope()}`;

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* armazenamento cheio ou bloqueado: segue só em memória */
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let savePending = false;
function flushSave() {
  clearTimeout(saveTimer);
  if (!savePending) return;
  savePending = false;
  writeJSON(dbKey(), useStore.getState().db);
}
/** Agrupa gravações em sequência (ex.: importação), mas nunca segura mais que um instante. */
function scheduleSave() {
  savePending = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 50);
}

let queue: QueueItem[] = [];
function enqueue(c: CollectionName, id: string) {
  if (!useStore.getState().userId) return;
  if (!queue.some((q) => q.c === c && q.id === id)) queue.push({ c, id });
  writeJSON(queueKey(), queue);
  scheduleFlush();
}

/* ---------- API de escrita ---------- */

export function put<K extends CollectionName>(c: K, entity: Omit<Collections[K], 'updatedAt' | 'id'> & { id?: string }): Collections[K] {
  const full = { ...entity, id: entity.id ?? uid(), updatedAt: nowStamp() } as Collections[K];
  useStore.setState((s) => ({ db: { ...s.db, [c]: { ...s.db[c], [full.id]: full } } }));
  scheduleSave();
  enqueue(c, full.id);
  return full;
}

export function patch<K extends CollectionName>(c: K, id: string, changes: Partial<Collections[K]>) {
  const cur = useStore.getState().db[c][id];
  if (!cur) return;
  put(c, { ...cur, ...changes, id } as Collections[K]);
}

/** Exclusão lógica, para que a remoção também sincronize entre aparelhos. */
export function remove(c: CollectionName, id: string) {
  patch(c, id, { deleted: true } as never);
}

export function updateSettings(changes: Partial<Settings>) {
  put('settings', { ...getSettings(), ...changes, id: 'main' });
}

export function getSettings(): Settings {
  const s = useStore.getState().db.settings.main;
  return s ? { ...defaultSettings(), ...s } : defaultSettings();
}

/* ---------- leitura ---------- */

export function useList<K extends CollectionName>(c: K): Collections[K][] {
  const map = useStore((s) => s.db[c]);
  return useMemo(() => Object.values(map).filter((x) => !x.deleted) as Collections[K][], [map]);
}

export function useItem<K extends CollectionName>(c: K, id: string | undefined): Collections[K] | undefined {
  return useStore((s) => (id ? (s.db[c][id] as Collections[K] | undefined) : undefined));
}

export function useSettings(): Settings {
  const s = useStore((st) => st.db.settings.main);
  return useMemo(() => (s ? { ...defaultSettings(), ...s } : defaultSettings()), [s]);
}

/* ---------- sincronização com o Supabase ---------- */

let flushTimer: ReturnType<typeof setTimeout> | undefined;
let flushing = false;
function scheduleFlush(delay = 400) {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, delay);
}

async function flush() {
  const { userId, db } = useStore.getState();
  if (!supabase || !userId || flushing || queue.length === 0) return;
  if (!navigator.onLine) return useStore.setState({ sync: 'offline' });
  flushing = true;
  useStore.setState({ sync: 'syncing' });
  const batch = queue.slice(0, 200);
  const rows: RecordRow[] = batch
    .map(({ c, id }) => db[c][id] && { c, item: db[c][id] })
    .filter(Boolean)
    .map((x) => {
      const { c, item } = x as { c: CollectionName; item: DB[CollectionName][string] };
      return { id: item.id, user_id: userId, collection: c, data: item, updated_at: item.updatedAt, deleted: !!item.deleted };
    });
  const { error } = await supabase.from('records').upsert(rows, { onConflict: 'user_id,collection,id' });
  flushing = false;
  if (error) {
    console.error('Falha ao sincronizar', error);
    useStore.setState({ sync: navigator.onLine ? 'error' : 'offline' });
    scheduleFlush(10_000);
    return;
  }
  queue = queue.filter((q) => !batch.some((b) => b.c === q.c && b.id === q.id && db[q.c][q.id]?.updatedAt === useStore.getState().db[q.c][q.id]?.updatedAt));
  writeJSON(queueKey(), queue);
  useStore.setState({ sync: queue.length ? 'syncing' : 'synced', lastSyncAt: nowStamp() });
  if (queue.length) scheduleFlush(50);
}

function mergeRows(rows: RecordRow[]) {
  if (!rows.length) return;
  useStore.setState((s) => {
    const db = { ...s.db };
    for (const r of rows) {
      if (!COLLECTIONS.includes(r.collection)) continue;
      const local = db[r.collection][r.id];
      if (local && local.updatedAt >= r.updated_at) continue; // a versão local é mais nova
      db[r.collection] = { ...db[r.collection], [r.id]: { ...(r.data as object), deleted: r.deleted } } as never;
    }
    return { db };
  });
  scheduleSave();
}

async function pull() {
  const { userId } = useStore.getState();
  if (!supabase || !userId) return;
  const since = localStorage.getItem(pulledKey()) ?? '1970-01-01T00:00:00Z';
  const startedAt = nowStamp();
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from('records')
      .select('*')
      .gt('updated_at', since)
      .order('updated_at', { ascending: true })
      .range(from, from + page - 1);
    if (error) {
      useStore.setState({ sync: navigator.onLine ? 'error' : 'offline' });
      return;
    }
    mergeRows(data as RecordRow[]);
    if (!data || data.length < page) break;
    from += page;
  }
  // margem de 1 min para não perder escritas concorrentes de outro aparelho
  localStorage.setItem(pulledKey(), new Date(Date.parse(startedAt) - 60_000).toISOString());
  useStore.setState({ sync: queue.length ? 'syncing' : 'synced', lastSyncAt: nowStamp() });
}

let channel: RealtimeChannel | null = null;
function subscribe(userId: string) {
  if (!supabase) return;
  // remove o canal anterior de verdade: reaproveitar o mesmo nome após subscribe() lança erro no supabase-js
  if (channel) supabase.removeChannel(channel);
  channel = supabase
    .channel(`records:${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `user_id=eq.${userId}` }, (payload) => {
      if (payload.new && 'id' in payload.new) mergeRows([payload.new as RecordRow]);
    })
    .subscribe();
}

/** Carrega os dados do escopo (usuário logado ou modo local) e liga a sincronização. */
export async function loadScope(userId: string | null, email: string | null = null) {
  useStore.setState({ userId, email, loaded: false, sync: userId ? 'syncing' : 'local' });
  const db = { ...emptyDB(), ...readJSON<Partial<DB>>(dbKey(), {}) } as DB;
  queue = readJSON<QueueItem[]>(queueKey(), []);
  useStore.setState({ db, loaded: true });
  if (userId) {
    try {
      subscribe(userId);
      await pull();
    } catch (e) {
      console.error('Falha ao sincronizar', e);
      useStore.setState({ sync: 'error' });
    }
    scheduleFlush(0);
  } else {
    if (channel && supabase) supabase.removeChannel(channel);
    channel = null;
  }
}

/** Ressincroniza ao voltar para o app (no iOS a conexão em tempo real cai em segundo plano). */
export function resync() {
  const { userId } = useStore.getState();
  if (!userId) return;
  try {
    subscribe(userId);
  } catch (e) {
    console.error(e);
  }
  pull().catch(console.error);
  scheduleFlush(0);
}

/** Copia os dados do modo local para a conta (usado no primeiro login). */
export function importLocalData() {
  const local = readJSON<Partial<DB>>('mestudos:db:local', {});
  for (const c of COLLECTIONS) {
    for (const item of Object.values(local[c] ?? {})) {
      put(c, item as never);
    }
  }
  localStorage.removeItem('mestudos:db:local');
}

export function hasLocalData(): boolean {
  const local = readJSON<Partial<DB>>('mestudos:db:local', {});
  return COLLECTIONS.some((c) => Object.keys(local[c] ?? {}).length > 0);
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => scheduleFlush(0));
  // grava na hora ao fechar/minimizar (no iPhone o app pode ser encerrado logo em seguida)
  window.addEventListener('pagehide', flushSave);
  window.addEventListener('beforeunload', flushSave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resync();
    else flushSave();
  });
}
