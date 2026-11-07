import type { ISODate, PlanBlock, Settings } from '../data/types';
import { addDays, weekDates, weekdayOf } from './dates';

export function dayCapacity(settings: Pick<Settings, 'availability' | 'availabilityOverrides'>, date: ISODate): number {
  return settings.availabilityOverrides?.[date] ?? settings.availability[weekdayOf(date)] ?? 0;
}

export interface DayLoad {
  date: ISODate;
  capacity: number;
  planned: number;
  excess: number;
  blocks: PlanBlock[];
}

export interface WeekLoad {
  days: DayLoad[];
  capacity: number;
  planned: number;
  over: number;
  overDays: DayLoad[];
}

export function weekLoad(blocks: PlanBlock[], settings: Pick<Settings, 'availability' | 'availabilityOverrides'>, anyDay: ISODate): WeekLoad {
  const days = weekDates(anyDay).map((date) => {
    const dayBlocks = blocks
      .filter((b) => !b.deleted && b.date === date)
      .sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99') || a.order - b.order);
    const capacity = dayCapacity(settings, date);
    const planned = dayBlocks.reduce((s, b) => s + b.minutes, 0);
    return { date, capacity, planned, excess: Math.max(0, planned - capacity), blocks: dayBlocks };
  });
  const capacity = days.reduce((s, d) => s + d.capacity, 0);
  const planned = days.reduce((s, d) => s + d.planned, 0);
  return { days, capacity, planned, over: Math.max(0, planned - capacity), overDays: days.filter((d) => d.excess > 0) };
}

export interface Move {
  blockId: string;
  title: string;
  minutes: number;
  from: ISODate;
  to: ISODate;
}

/**
 * Sugere como resolver os excessos da semana: primeiro move blocos para dias com folga
 * na mesma semana (a partir de hoje); o que não couber vai para a semana seguinte.
 * Blocos concluídos e revisões (que têm data certa) não são movidos.
 */
export function suggestRedistribution(
  blocks: PlanBlock[],
  settings: Pick<Settings, 'availability' | 'availabilityOverrides'>,
  anyDay: ISODate,
  today: ISODate,
): Move[] {
  const week = weekLoad(blocks, settings, anyDay);
  const nextWeek = weekLoad(blocks, settings, addDays(week.days[0].date, 7));
  const slack = new Map<ISODate, number>();
  for (const d of [...week.days, ...nextWeek.days]) slack.set(d.date, d.capacity - d.planned);

  const moves: Move[] = [];
  for (const day of week.days) {
    if (day.date < today) continue;
    let excess = day.planned - day.capacity;
    if (excess <= 0) continue;
    const movable = day.blocks
      .filter((b) => !b.done && b.kind !== 'revisao')
      .sort((a, b) => b.order - a.order); // os adicionados por último saem primeiro
    for (const b of movable) {
      if (excess <= 0) break;
      const target =
        week.days.find((d) => d.date >= today && d.date !== day.date && (slack.get(d.date) ?? 0) >= b.minutes)?.date ??
        nextWeek.days.find((d) => (slack.get(d.date) ?? 0) >= b.minutes)?.date ??
        addDays(day.date, 7);
      slack.set(target, (slack.get(target) ?? 0) - b.minutes);
      slack.set(day.date, (slack.get(day.date) ?? 0) + b.minutes);
      excess -= b.minutes;
      moves.push({ blockId: b.id, title: b.title, minutes: b.minutes, from: day.date, to: target });
    }
  }
  return moves;
}
