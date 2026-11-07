import { describe, expect, it } from 'vitest';
import { buildQuizPrompt, buildSummaryPrompt, cleanSummary, detectResponse, parseQuiz } from './chatgpt';
import type { Topic } from '../data/types';

const topic: Topic = { id: 't', updatedAt: '', subjectId: 's', name: 'Ciclo cardíaco', group: 'Sistema cardiovascular', status: 'estudei', summary: 'Diástole: enchimento.', materials: [], spacedEnabled: true, intervals: [1], reviews: [], order: 0 };
const subject = { id: 's', updatedAt: '', name: 'Fisiologia', color: 'plum' as const, order: 0 };

describe('pedidos', () => {
  it('inclui tema, matéria e anotações', () => {
    const p = buildSummaryPrompt({ topic, subject, course: 'Medicina', term: '4º período' });
    expect(p).toContain('"Ciclo cardíaco" (Fisiologia › Sistema cardiovascular)');
    expect(p).toContain('Diástole: enchimento.');
    expect(p).toContain('### Para revisar');
  });
  it('pede JSON e repassa os erros', () => {
    const p = buildQuizPrompt({ topic, subject, course: 'Medicina' }, { count: 10, level: 'residencia', wrong: ['Qual valva fecha em B1?'] });
    expect(p).toContain('Crie 10 questões');
    expect(p).toContain('"questoes"');
    expect(p).toContain('Qual valva fecha em B1?');
  });
});

describe('leitura das questões', () => {
  it('lê o formato pedido dentro de bloco de código', () => {
    const text = 'Claro! Aqui estão:\n```json\n{"questoes":[{"enunciado":"B1 corresponde a?","alternativas":["A) Fechamento AV","B) Fechamento semilunar","C) Abertura AV","D) Ejeção","E) Enchimento"],"correta":"A","explicacao":"B1 = valvas AV."}]}\n```\nBons estudos!';
    const r = parseQuiz(text)!;
    expect(r.questions).toHaveLength(1);
    expect(r.questions[0].options[0]).toBe('Fechamento AV');
    expect(r.questions[0].answer).toBe(0);
    expect(r.questions[0].explanation).toBe('B1 = valvas AV.');
  });
  it('tolera variações: lista solta, alternativas em objeto, gabarito por texto, vírgula sobrando', () => {
    const text = '[{"pergunta":"X?","opcoes":{"A":"um","B":"dois","C":"três"},"resposta":"dois",},{"question":"Y?","options":["a","b"],"answer":"b) "}]';
    const r = parseQuiz(text)!;
    expect(r.questions.map((q) => q.answer)).toEqual([1, 1]);
  });
  it('descarta questões inválidas e conta quantas', () => {
    const r = parseQuiz('{"questoes":[{"enunciado":"ok","alternativas":["a","b"],"correta":"B"},{"enunciado":"sem gabarito","alternativas":["a","b"]}]}')!;
    expect(r.questions).toHaveLength(1);
    expect(r.skipped).toBe(1);
  });
  it('não confunde resumo com questões', () => {
    expect(detectResponse('### Ciclo\n- Diástole').kind).toBe('summary');
    expect(detectResponse('   ').kind).toBe('empty');
  });
  it('normaliza o resumo para o formato do app', () => {
    expect(cleanSummary('## Título\n* item\n\n\n\nfim')).toBe('### Título\n- item\n\nfim');
  });
});
