import { create } from 'zustand';
import { getSettings, put } from './store';
import { toISODate } from '../lib/dates';
import { chime, notify } from '../lib/notify';

export type PomoMode = 'focus' | 'short' | 'long';
type Status = 'idle' | 'running' | 'paused';

interface PomoState {
  mode: PomoMode;
  status: Status;
  durationMs: number;
  endsAt: number | null; // quando rodando
  remainingMs: number; // quando pausado/parado
  startedAt: number | null; // início real da sessão de foco
  cycle: number; // ciclos de foco concluídos no conjunto atual
  subjectId?: string;
  topicId?: string;
}

const KEY = 'mestudos:pomodoro';

function minutesFor(mode: PomoMode) {
  const p = getSettings().pomodoro;
  return mode === 'focus' ? p.focus : mode === 'short' ? p.short : p.long;
}

function load(): PomoState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { mode: 'focus', status: 'idle', durationMs: 25 * 60_000, endsAt: null, remainingMs: 25 * 60_000, startedAt: null, cycle: 0 };
}

export const usePomodoro = create<PomoState>(load);
usePomodoro.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
});

export function remainingNow(s: PomoState, now = Date.now()) {
  return s.status === 'running' && s.endsAt ? Math.max(0, s.endsAt - now) : s.remainingMs;
}

export const pomodoro = {
  setMode(mode: PomoMode) {
    const ms = minutesFor(mode) * 60_000;
    usePomodoro.setState({ mode, status: 'idle', durationMs: ms, remainingMs: ms, endsAt: null, startedAt: null });
  },
  /** Reaplica a duração quando ela muda nas configurações (só se o timer estiver parado). */
  syncDuration() {
    const s = usePomodoro.getState();
    if (s.status !== 'idle') return;
    const ms = minutesFor(s.mode) * 60_000;
    usePomodoro.setState({ durationMs: ms, remainingMs: ms });
  },
  setTarget(subjectId?: string, topicId?: string) {
    usePomodoro.setState({ subjectId, topicId });
  },
  start() {
    const s = usePomodoro.getState();
    if (s.status === 'running') return;
    const now = Date.now();
    if (s.mode === 'focus' && s.cycle >= getSettings().pomodoro.cyclesBeforeLong) usePomodoro.setState({ cycle: 0 });
    usePomodoro.setState({
      status: 'running',
      endsAt: now + s.remainingMs,
      startedAt: s.startedAt ?? now,
    });
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  },
  pause() {
    const s = usePomodoro.getState();
    if (s.status !== 'running') return;
    usePomodoro.setState({ status: 'paused', remainingMs: remainingNow(s), endsAt: null });
  },
  /** Minutos de foco já cumpridos na sessão atual. */
  elapsedFocusMinutes() {
    const s = usePomodoro.getState();
    if (s.mode !== 'focus') return 0;
    return Math.round((s.durationMs - remainingNow(s)) / 60_000);
  },
  /** Encerra antes do fim; registra `minutes` se > 0. */
  stop(minutes: number) {
    const s = usePomodoro.getState();
    if (s.mode === 'focus' && minutes > 0) record(s, minutes);
    pomodoro.setMode(s.mode);
  },
  /** Verificado a cada segundo pelo componente global. */
  tick() {
    const s = usePomodoro.getState();
    if (s.status !== 'running' || !s.endsAt || Date.now() < s.endsAt) return;
    finish(s);
  },
};

function record(s: PomoState, minutes: number) {
  if (!s.subjectId) return;
  const started = new Date(s.startedAt ?? Date.now() - minutes * 60_000);
  put('sessions', {
    subjectId: s.subjectId,
    topicId: s.topicId,
    startedAt: started.toISOString(),
    date: toISODate(started),
    minutes,
  });
}

function finish(s: PomoState) {
  chime();
  if (s.mode === 'focus') {
    record(s, Math.round(s.durationMs / 60_000));
    const cycle = s.cycle + 1;
    const p = getSettings().pomodoro;
    const next: PomoMode = cycle % p.cyclesBeforeLong === 0 ? 'long' : 'short';
    notify('Foco concluído', next === 'long' ? 'Hora de uma pausa longa. Você merece.' : 'Hora de uma pausa curta.', 'pomodoro');
    pomodoro.setMode(next);
    usePomodoro.setState({ cycle });
  } else {
    notify('Pausa encerrada', 'Pronta para mais um ciclo?', 'pomodoro');
    pomodoro.setMode('focus');
    if (s.mode === 'long') usePomodoro.setState({ cycle: 0 });
  }
}
