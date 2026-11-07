import type { Assessment, GradeMethod } from '../data/types';

export interface GradeSummary {
  totalWeight: number;
  evaluatedWeight: number;
  remainingWeight: number;
  weightedSum: number; // Σ nota × peso das lançadas
  partialAverage: number | null; // média das lançadas
  pointsEarned: number; // pontos já garantidos na média final
  finalAverage: number | null; // quando tudo foi lançado
  needed: number | null; // nota necessária (uniforme) nas pendentes
  missingPoints: number; // pontos que faltam na média final
  status: 'sem_avaliacoes' | 'em_andamento' | 'garantida' | 'impossivel' | 'aprovada' | 'reprovada';
}

export function summarizeGrades(list: Assessment[], min: number, method: GradeMethod): GradeSummary {
  const items = list.filter((a) => !a.deleted);
  const w = (a: Assessment) => (method === 'aritmetica' ? 1 : Math.max(0, a.weight));
  const totalWeight = sum(items.map(w));
  const launched = items.filter((a) => a.grade !== null && a.grade !== undefined);
  const evaluatedWeight = sum(launched.map(w));
  const remainingWeight = totalWeight - evaluatedWeight;
  const weightedSum = sum(launched.map((a) => (a.grade as number) * w(a)));
  const partialAverage = evaluatedWeight > 0 ? weightedSum / evaluatedWeight : null;
  const pointsEarned = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const missingPoints = Math.max(0, min - pointsEarned);

  if (items.length === 0 || totalWeight === 0) {
    return { totalWeight, evaluatedWeight, remainingWeight, weightedSum, partialAverage, pointsEarned, finalAverage: null, needed: null, missingPoints, status: 'sem_avaliacoes' };
  }
  if (remainingWeight <= 0) {
    const finalAverage = weightedSum / totalWeight;
    return { totalWeight, evaluatedWeight, remainingWeight: 0, weightedSum, partialAverage, pointsEarned, finalAverage, needed: null, missingPoints, status: finalAverage >= min - 1e-9 ? 'aprovada' : 'reprovada' };
  }
  const needed = (min * totalWeight - weightedSum) / remainingWeight;
  const status = needed <= 0 ? 'garantida' : needed > 10 + 1e-9 ? 'impossivel' : 'em_andamento';
  return { totalWeight, evaluatedWeight, remainingWeight, weightedSum, partialAverage, pointsEarned, finalAverage: null, needed: Math.max(0, needed), missingPoints, status };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** 7,7 → "7,70" */
export function formatGrade(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toFixed(digits).replace('.', ',');
}

export function parseDecimal(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (t === '' || t === '—' || t === '-') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
