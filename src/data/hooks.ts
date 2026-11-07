import { useEffect, useMemo, useState } from 'react';
import { useList } from './store';
import { todayISO } from '../lib/dates';
import type { Subject, Term } from './types';

export function useToday() {
  const [today, setToday] = useState(todayISO);
  useEffect(() => {
    const id = setInterval(() => setToday((t) => (t === todayISO() ? t : todayISO())), 30_000);
    return () => clearInterval(id);
  }, []);
  return today;
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useSubjects(): Subject[] {
  const list = useList('subjects');
  return useMemo(() => [...list].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)), [list]);
}

export function useSubjectMap(): Map<string, Subject> {
  const list = useList('subjects');
  return useMemo(() => new Map(list.map((s) => [s.id, s])), [list]);
}

export function useTerm(): Term | undefined {
  const terms = useList('terms');
  return useMemo(() => [...terms].sort((a, b) => b.start.localeCompare(a.start))[0], [terms]);
}
