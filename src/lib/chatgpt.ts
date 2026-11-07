import type { QuizLevel, QuizQuestion, Subject, Topic } from '../data/types';

export const CHATGPT_URL = 'https://chatgpt.com/';

export const LEVEL_LABEL: Record<QuizLevel, string> = {
  basico: 'Básico',
  intermediario: 'Intermediário',
  residencia: 'Estilo residência',
};

const LEVEL_PROMPT: Record<QuizLevel, string> = {
  basico: 'básico, cobrando conceitos fundamentais e definições',
  intermediario: 'intermediário, cobrando aplicação, mecanismos e integração entre conceitos',
  residencia: 'avançado, no estilo de provas de residência médica, com casos clínicos e raciocínio diagnóstico',
};

interface Ctx {
  topic: Topic;
  subject?: Subject;
  course: string;
  term?: string;
}

function header({ topic, subject, course, term }: Ctx) {
  const where = [subject?.name, topic.group].filter(Boolean).join(' › ');
  const who = [course || 'Medicina', term].filter(Boolean).join(', ');
  return { theme: `"${topic.name}"${where ? ` (${where})` : ''}`, who };
}

function notesBlock(summary: string, intro: string) {
  const t = summary.trim();
  return t ? `\n\n${intro}\n"""\n${t.slice(0, 6000)}\n"""` : '';
}

export function buildSummaryPrompt(ctx: Ctx): string {
  const { theme, who } = header(ctx);
  return `Você é um professor de medicina ajudando uma estudante (${who}). Escreva um resumo de estudo sobre ${theme}.

Requisitos:
- Português do Brasil, linguagem clara e tecnicamente precisa.
- Entre 300 e 500 palavras.
- Formato: títulos começando com "### ", listas com "- " e destaques em **negrito**. Não use tabelas, emojis nem outros formatos.
- Inclua conceitos-chave, mecanismos, correlações clínicas e as "pegadinhas" mais comuns em provas.
- Termine com a seção "### Para revisar", com 3 a 5 perguntas curtas de autoavaliação.
- Responda apenas com o resumo, sem introdução nem despedida.${notesBlock(ctx.topic.summary, 'Use como base as anotações dela abaixo, corrigindo erros e completando o que faltar:')}`;
}

export function buildQuizPrompt(ctx: Ctx, opts: { count: number; level: QuizLevel; focus?: string; wrong?: string[] }): string {
  const { theme, who } = header(ctx);
  const focus = opts.focus?.trim() ? `\nÊnfase pedida por ela: ${opts.focus.trim()}.` : '';
  const wrong = opts.wrong?.length
    ? `\n\nEla errou estas questões recentemente. Crie questões NOVAS que trabalhem os mesmos conceitos, sem repeti-las:\n${opts.wrong.slice(0, 10).map((w) => `- ${w.slice(0, 300)}`).join('\n')}`
    : '';
  return `Crie ${opts.count} questões de múltipla escolha sobre ${theme} para uma estudante (${who}).
Nível: ${LEVEL_PROMPT[opts.level]}.${focus}

Regras:
- Português do Brasil.
- Exatamente 5 alternativas por questão, apenas uma correta. Varie a posição da correta entre A e E.
- Prefira casos clínicos curtos e raciocínio, não só memorização.
- Explicação de 1 a 3 frases: por que a correta está certa e, quando útil, o erro principal das outras.
- Responda SOMENTE com um bloco de código JSON válido, exatamente neste formato (sem texto antes ou depois):
{"questoes":[{"enunciado":"...","alternativas":["...","...","...","...","..."],"correta":"A","explicacao":"..."}]}${notesBlock(ctx.topic.summary, 'Baseie-se também no resumo dela:')}${wrong}`;
}

/* ---------- leitura da resposta ---------- */

const pick = (o: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

const stripLetter = (s: string) => s.replace(/^\s*\(?[A-Ea-e]\s*[).:\-–]\s+/, '').trim();

function extractJSON(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fenced ? fenced[1] : text).trim();
  const starts = [body.indexOf('{'), body.indexOf('[')].filter((i) => i >= 0);
  if (!starts.length) return null;
  const start = Math.min(...starts);
  const end = Math.max(body.lastIndexOf('}'), body.lastIndexOf(']'));
  if (end <= start) return null;
  const raw = body.slice(start, end + 1)
    .replace(/[“”]/g, '"') // aspas “curvas” que às vezes aparecem ao copiar
    .replace(/,\s*([}\]])/g, '$1'); // vírgula sobrando no fim
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Índice da correta a partir de letra ("C", "c)"), número ("3", 1-based) ou o próprio texto. */
function answerIndex(value: unknown, options: string[]): number {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 && value < options.length ? value : -1;
  if (typeof value !== 'string') return -1;
  const v = value.trim();
  const letter = /^\(?([A-Ea-e])\)?(?:[).:\s]|$)/.exec(v);
  if (letter) return letter[1].toUpperCase().charCodeAt(0) - 65;
  if (/^\d+$/.test(v)) return Number(v) - 1;
  const i = options.findIndex((o) => o.toLowerCase() === stripLetter(v).toLowerCase());
  return i;
}

export interface ParsedQuiz {
  questions: Omit<QuizQuestion, 'id'>[];
  skipped: number;
}

/** Lê as questões do JSON que o ChatGPT devolveu, tolerando variações comuns. */
export function parseQuiz(text: string): ParsedQuiz | null {
  const data = extractJSON(text);
  if (!data) return null;
  const list = Array.isArray(data)
    ? data
    : (pick(data as Record<string, unknown>, ['questoes', 'questões', 'questions', 'perguntas', 'itens']) as unknown[] | undefined);
  if (!Array.isArray(list)) return null;
  let skipped = 0;
  const questions: Omit<QuizQuestion, 'id'>[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') { skipped++; continue; }
    const o = item as Record<string, unknown>;
    const stem = String(pick(o, ['enunciado', 'pergunta', 'questao', 'questão', 'question', 'stem']) ?? '').trim();
    const rawOpts = pick(o, ['alternativas', 'opcoes', 'opções', 'options', 'choices']);
    const options = (Array.isArray(rawOpts) ? rawOpts : rawOpts && typeof rawOpts === 'object' ? Object.values(rawOpts) : [])
      .map((x) => stripLetter(String(x)))
      .filter(Boolean);
    const rawAnswer = pick(o, ['correta', 'resposta', 'gabarito', 'answer', 'correct']);
    const answer = answerIndex(rawAnswer, options);
    const explanation = String(pick(o, ['explicacao', 'explicação', 'comentario', 'comentário', 'explanation']) ?? '').trim() || undefined;
    if (!stem || options.length < 2 || options.length > 6 || answer < 0 || answer >= options.length) { skipped++; continue; }
    questions.push({ stem, options, answer, explanation });
  }
  return questions.length ? { questions, skipped } : null;
}

/** Limpa um resumo colado para o formato que o app renderiza. */
export function cleanSummary(text: string): string {
  let t = text.replace(/\r/g, '').trim();
  const fenced = /^```(?:markdown|md)?\s*([\s\S]*?)```$/i.exec(t);
  if (fenced) t = fenced[1].trim();
  return t
    .split('\n')
    .map((l) => l.replace(/^#{1,6}\s+/, '### ').replace(/^(\s*)[*•]\s+/, '$1- '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

export type Detected = { kind: 'quiz'; quiz: ParsedQuiz } | { kind: 'summary'; text: string } | { kind: 'empty' };

export function detectResponse(text: string): Detected {
  if (!text.trim()) return { kind: 'empty' };
  const quiz = parseQuiz(text);
  if (quiz) return { kind: 'quiz', quiz };
  return { kind: 'summary', text: cleanSummary(text) };
}

/** Copia o texto. Chame dentro do clique (exigência do iPhone). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}
