import type { FocusSession, ISODate, QuestionLog } from '../data/types';
import { addDays } from './dates';

export interface QTotals {
  done: number;
  correct: number;
  accuracy: number | null; // 0..1
}

export function questionTotals(logs: QuestionLog[], from?: ISODate, to?: ISODate): QTotals {
  let done = 0;
  let correct = 0;
  for (const l of logs) {
    if (l.deleted) continue;
    if (from && l.date < from) continue;
    if (to && l.date > to) continue;
    done += l.done;
    correct += l.correct;
  }
  return { done, correct, accuracy: done > 0 ? correct / done : null };
}

/** Períodos de 7 dias terminando em `today`, do mais antigo ao mais recente. */
export function weeklySeries(logs: QuestionLog[], today: ISODate, weeks: number) {
  return Array.from({ length: weeks }, (_, i) => {
    const to = addDays(today, -7 * (weeks - 1 - i));
    const from = addDays(to, -6);
    return { from, to, ...questionTotals(logs, from, to) };
  });
}

export function byTopic(logs: QuestionLog[], from: ISODate, to: ISODate) {
  const map = new Map<string, { key: string; topicId?: string; subjectId: string; done: number; correct: number }>();
  for (const l of logs) {
    if (l.deleted || l.date < from || l.date > to) continue;
    const key = l.topicId ?? `subject:${l.subjectId}`;
    const cur = map.get(key) ?? { key, topicId: l.topicId, subjectId: l.subjectId, done: 0, correct: 0 };
    cur.done += l.done;
    cur.correct += l.correct;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.done - a.done);
}

export function focusBySubject(sessions: FocusSession[], from: ISODate, to: ISODate) {
  const map = new Map<string, number>();
  let total = 0;
  for (const s of sessions) {
    if (s.deleted || s.date < from || s.date > to) continue;
    map.set(s.subjectId, (map.get(s.subjectId) ?? 0) + s.minutes);
    total += s.minutes;
  }
  const rows = [...map.entries()].map(([subjectId, minutes]) => ({ subjectId, minutes, share: total ? minutes / total : 0 }));
  rows.sort((a, b) => b.minutes - a.minutes);
  return { total, rows };
}

/** 0.8 → "80%", 0.6667 → "66,7%" */
export function formatPercent(x: number | null): string {
  if (x === null) return '—';
  const v = Math.round(x * 1000) / 10;
  return `${Number.isInteger(v) ? v : v.toFixed(1).replace('.', ',')}%`;
}
