import type { ISODate, Review, Topic, TopicStatus } from '../data/types';
import { addDays } from './dates';

/** Gera as revisões a partir da data de estudo, mantendo as já feitas. */
export function buildReviews(studiedAt: ISODate, intervals: number[], existing: Review[] = []): Review[] {
  return [...intervals]
    .filter((n) => n > 0)
    .sort((a, b) => a - b)
    .map((intervalDays, i) => ({
      intervalDays,
      due: addDays(studiedAt, intervalDays),
      ...(existing[i]?.doneAt ? { doneAt: existing[i].doneAt } : {}),
    }));
}

export function nextPendingReview(t: Pick<Topic, 'reviews' | 'spacedEnabled'>): Review | undefined {
  if (!t.spacedEnabled) return undefined;
  return t.reviews.find((r) => !r.doneAt);
}

/** Patch para mudar o status de um tema, cuidando de datas e revisões. */
export function statusPatch(t: Topic, status: TopicStatus, today: ISODate): Partial<Topic> {
  if (status === 'nao_vi') {
    return { status, studiedAt: undefined, reviews: [] };
  }
  const studiedAt = t.studiedAt ?? today;
  const reviews = t.spacedEnabled ? buildReviews(studiedAt, t.intervals, t.reviews) : t.reviews;
  if (status === 'estudei') {
    return { status, studiedAt, reviews };
  }
  // revisado: conclui a próxima revisão pendente
  return { status, studiedAt, reviews: completeNext(reviews, today) };
}

export function completeNext(reviews: Review[], today: ISODate): Review[] {
  const idx = reviews.findIndex((r) => !r.doneAt);
  if (idx < 0) return reviews;
  return reviews.map((r, i) => (i === idx ? { ...r, doneAt: today } : r));
}

export function intervalsPatch(t: Topic, intervals: number[]): Partial<Topic> {
  return {
    intervals,
    reviews: t.studiedAt && t.spacedEnabled ? buildReviews(t.studiedAt, intervals, t.reviews) : t.reviews,
  };
}

export interface DueReview {
  topic: Topic;
  review: Review;
  index: number;
  overdue: boolean;
}

/** Revisões pendentes com vencimento até `date` (atrasadas inclusas), e as concluídas no próprio dia. */
export function reviewsForDay(topics: Topic[], date: ISODate): { pending: DueReview[]; done: DueReview[] } {
  const pending: DueReview[] = [];
  const done: DueReview[] = [];
  for (const topic of topics) {
    if (!topic.spacedEnabled) continue;
    topic.reviews.forEach((review, index) => {
      if (review.doneAt === date) done.push({ topic, review, index, overdue: false });
      else if (!review.doneAt && review.due <= date && isFirstPending(topic, index)) {
        pending.push({ topic, review, index, overdue: review.due < date });
      }
    });
  }
  return { pending, done };
}

function isFirstPending(t: Topic, index: number) {
  return t.reviews.findIndex((r) => !r.doneAt) === index;
}

/** Todas as revisões (pendentes) em um intervalo de datas, para o calendário. */
export function reviewsInRange(topics: Topic[], from: ISODate, to: ISODate): DueReview[] {
  const out: DueReview[] = [];
  for (const topic of topics) {
    if (!topic.spacedEnabled) continue;
    topic.reviews.forEach((review, index) => {
      const day = review.doneAt ?? review.due;
      if (day >= from && day <= to) out.push({ topic, review, index, overdue: false });
    });
  }
  return out;
}
