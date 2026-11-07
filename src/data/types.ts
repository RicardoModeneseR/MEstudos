/** Datas no formato 'YYYY-MM-DD' (dia local) e horários 'HH:mm'. */
export type ISODate = string;
export type HHmm = string;

interface Base {
  id: string;
  updatedAt: string; // ISO timestamp, usado na sincronização (última escrita vence)
  deleted?: boolean;
}

export interface Subject extends Base {
  name: string;
  color: SubjectColor;
  order: number;
}
export type SubjectColor = 'plum' | 'sage' | 'sand' | 'rose' | 'sky' | 'amber';

export type TopicStatus = 'nao_vi' | 'estudei' | 'revisado';

export interface Review {
  due: ISODate;
  intervalDays: number;
  doneAt?: ISODate;
}

export interface Material {
  id: string;
  name: string;
  url?: string; // link externo
  storagePath?: string; // arquivo no Supabase Storage
  size?: number;
  addedAt: ISODate;
}

export interface Topic extends Base {
  subjectId: string;
  name: string;
  group?: string; // ex.: "Sistema cardiovascular"
  status: TopicStatus;
  studiedAt?: ISODate;
  summary: string; // markdown simples
  summarySavedAt?: string;
  materials: Material[];
  spacedEnabled: boolean;
  intervals: number[]; // dias após o estudo, ex.: [1, 7, 21]
  reviews: Review[];
  order: number;
}

export type EventType = 'prova' | 'entrega' | 'outro';

export interface StudyEvent extends Base {
  title: string;
  type: EventType;
  subjectId?: string;
  date: ISODate;
  time?: HHmm;
  location?: string;
  notes?: string;
  remindersEnabled: boolean;
  reminderDays: number[]; // ex.: [3, 1]
  reminderTime: HHmm;
}

export interface Term extends Base {
  name: string;
  start: ISODate;
  end: ISODate;
}

export interface ClassSlot extends Base {
  subjectId: string;
  weekday: number; // 1 = segunda ... 6 = sábado
  start: HHmm;
  end: HHmm;
  location?: string;
  kind?: string; // "Teórica", "Laboratório", "Tutoria"...
  validFrom?: ISODate; // permite mudar a grade a partir de uma data
  validUntil?: ISODate;
}

export interface QuestionLog extends Base {
  subjectId: string;
  topicId?: string;
  date: ISODate;
  done: number;
  correct: number;
}

export type BlockKind = 'estudo' | 'revisao' | 'questoes';

export interface PlanBlock extends Base {
  date: ISODate;
  title: string;
  topicId?: string;
  subjectId?: string;
  kind: BlockKind;
  minutes: number;
  time?: HHmm;
  done: boolean;
  order: number;
}

export interface FocusSession extends Base {
  subjectId: string;
  topicId?: string;
  startedAt: string; // ISO timestamp
  date: ISODate;
  minutes: number;
}

export interface Assessment extends Base {
  subjectId: string;
  name: string;
  date?: ISODate;
  weight: number;
  grade: number | null; // null = pendente
  order: number;
}

export type GradeMethod = 'ponderada' | 'aritmetica';

export interface Settings extends Base {
  displayName: string;
  course: string;
  /** minutos livres por dia da semana, índice 0 = domingo */
  availability: number[];
  /** sobrescritas de disponibilidade por data */
  availabilityOverrides: Record<ISODate, number>;
  defaultIntervals: number[];
  pomodoro: { focus: number; short: number; long: number; cyclesBeforeLong: number };
  passing: Record<string, { min: number; method: GradeMethod }>; // por subjectId
  defaultPassing: number;
  timezone: string;
}

export interface Collections {
  subjects: Subject;
  topics: Topic;
  events: StudyEvent;
  terms: Term;
  classes: ClassSlot;
  questionLogs: QuestionLog;
  planBlocks: PlanBlock;
  sessions: FocusSession;
  assessments: Assessment;
  settings: Settings;
}

export type CollectionName = keyof Collections;
export const COLLECTIONS: CollectionName[] = [
  'subjects',
  'topics',
  'events',
  'terms',
  'classes',
  'questionLogs',
  'planBlocks',
  'sessions',
  'assessments',
  'settings',
];

export type DB = { [K in CollectionName]: Record<string, Collections[K]> };
