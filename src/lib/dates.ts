import { format as dfFormat } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { ISODate } from '../data/types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): ISODate {
  return toISODate(new Date());
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function addMonths(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISODate(d);
}

/** Dias inteiros de a até b (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  const ms = parseISODate(b).getTime() - parseISODate(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** 0 = domingo ... 6 = sábado */
export function weekdayOf(s: ISODate): number {
  return parseISODate(s).getDay();
}

/** Segunda-feira da semana de s. */
export function startOfWeek(s: ISODate): ISODate {
  const wd = weekdayOf(s);
  return addDays(s, wd === 0 ? -6 : 1 - wd);
}

export function weekDates(s: ISODate): ISODate[] {
  const start = startOfWeek(s);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function startOfMonth(s: ISODate): ISODate {
  return s.slice(0, 8) + '01';
}

/** Grade de 6 semanas (segunda a domingo) que cobre o mês. */
export function monthGrid(s: ISODate): ISODate[] {
  const first = startOfWeek(startOfMonth(s));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export function inRange(s: ISODate, from: ISODate, to: ISODate): boolean {
  return s >= from && s <= to;
}

export function fmt(s: ISODate | Date, pattern: string): string {
  const d = typeof s === 'string' ? parseISODate(s) : s;
  return dfFormat(d, pattern, { locale: ptBR });
}

export const WEEKDAY_SHORT = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
export const WEEKDAY_LONG = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
export const WEEKDAY_NAME = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "6h 30min", "45 min", "2h" */
export function formatMinutes(total: number): string {
  const m = Math.round(total);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}min` : `${h}h`;
}

/** "Hoje", "Amanhã", "Em 4 dias", "Ontem", "Há 3 dias" */
export function countdown(from: ISODate, to: ISODate): string {
  const d = diffDays(from, to);
  if (d === 0) return 'Hoje';
  if (d === 1) return 'Amanhã';
  if (d === -1) return 'Ontem';
  return d > 0 ? `Em ${d} dias` : `Há ${-d} dias`;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minutesToTime(m: number): string {
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return 'Boa noite';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}
