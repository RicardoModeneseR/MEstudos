import { describe, expect, it } from 'vitest';
import { summarizeGrades } from './grades';
import { suggestRedistribution, weekLoad } from './planning';
import { buildReviews, statusPatch } from './reviews';
import { formatPercent, weeklySeries } from './stats';
import { countdown, formatMinutes, monthGrid, startOfWeek } from './dates';
import type { Assessment, PlanBlock, Topic } from '../data/types';

const a = (weight: number, grade: number | null): Assessment => ({ id: Math.random() + '', updatedAt: '', subjectId: 's', name: 'x', weight, grade, order: 0 });

describe('notas', () => {
  it('reproduz o exemplo de Fisiologia do design', () => {
    const s = summarizeGrades([a(3, 7.5), a(2, 8), a(5, null)], 7, 'ponderada');
    expect(s.partialAverage).toBeCloseTo(7.7);
    expect(s.pointsEarned).toBeCloseTo(3.85);
    expect(s.needed).toBeCloseTo(6.3);
    expect(s.missingPoints).toBeCloseTo(3.15);
    expect(s.status).toBe('em_andamento');
  });
  it('média aritmética ignora pesos', () => {
    const s = summarizeGrades([a(3, 6), a(1, 8), a(1, null)], 7, 'aritmetica');
    expect(s.needed).toBeCloseTo(7);
  });
  it('detecta aprovação garantida e impossível', () => {
    expect(summarizeGrades([a(5, 10), a(5, null)], 5, 'ponderada').status).toBe('garantida');
    expect(summarizeGrades([a(8, 2), a(2, null)], 7, 'ponderada').status).toBe('impossivel');
    expect(summarizeGrades([a(5, 7), a(5, 6)], 7, 'ponderada').status).toBe('reprovada');
  });
});

describe('revisão espaçada', () => {
  it('agenda revisões a partir da data de estudo', () => {
    expect(buildReviews('2026-11-08', [1, 7, 21]).map((r) => r.due)).toEqual(['2026-11-09', '2026-11-15', '2026-11-29']);
  });
  it('marca estudado e depois revisado', () => {
    const t: Topic = { id: 't', updatedAt: '', subjectId: 's', name: 'Ciclo', status: 'nao_vi', summary: '', materials: [], spacedEnabled: true, intervals: [1, 7], reviews: [], order: 0 };
    const p1 = statusPatch(t, 'estudei', '2026-11-08');
    expect(p1.reviews?.length).toBe(2);
    const p2 = statusPatch({ ...t, ...p1 }, 'revisado', '2026-11-09');
    expect(p2.reviews?.[0].doneAt).toBe('2026-11-09');
    expect(p2.reviews?.[1].doneAt).toBeUndefined();
  });
});

describe('planejamento', () => {
  const settings = { availability: [60, 120, 60, 180, 120, 60, 120], availabilityOverrides: {} };
  let order = 0;
  const b = (date: string, minutes: number, kind: PlanBlock['kind'] = 'estudo'): PlanBlock => ({ id: `${date}-${order}`, updatedAt: '', date, title: 'x', kind, minutes, done: false, order: order++ });
  const blocks = [
    b('2026-11-09', 120), b('2026-11-10', 120), b('2026-11-11', 180), b('2026-11-12', 120), b('2026-11-12', 60),
    b('2026-11-13', 60), b('2026-11-14', 120), b('2026-11-14', 60), b('2026-11-15', 60, 'revisao'),
  ];
  it('soma capacidade e excesso', () => {
    const w = weekLoad(blocks, settings, '2026-11-11');
    expect(w.capacity).toBe(720);
    expect(w.planned).toBe(900);
    expect(w.over).toBe(180);
    expect(w.overDays.map((d) => d.date)).toEqual(['2026-11-10', '2026-11-12', '2026-11-14']);
  });
  it('sugere mover o excesso para a semana seguinte quando não há folga', () => {
    const moves = suggestRedistribution(blocks, settings, '2026-11-09', '2026-11-09');
    expect(moves.reduce((s, m) => s + m.minutes, 0)).toBeGreaterThanOrEqual(180);
    const after = blocks.map((x) => { const m = moves.find((mv) => mv.blockId === x.id); return m ? { ...x, date: m.to } : x; });
    expect(weekLoad(after, settings, '2026-11-09').over).toBe(0);
  });
});

describe('formatação e datas', () => {
  it('formata', () => {
    expect(formatMinutes(390)).toBe('6h 30min');
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatPercent(20 / 30)).toBe('66,7%');
    expect(formatPercent(0.8)).toBe('80%');
    expect(countdown('2026-11-09', '2026-11-13')).toBe('Em 4 dias');
  });
  it('calcula semanas', () => {
    expect(startOfWeek('2026-11-15')).toBe('2026-11-09');
    expect(monthGrid('2026-11-09')[0]).toBe('2026-10-26');
    const series = weeklySeries([], '2026-11-09', 4);
    expect(series[0].from).toBe('2026-10-13');
    expect(series[3].from).toBe('2026-11-03');
  });
});
