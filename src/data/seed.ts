import { put, updateSettings, getSettings } from './store';
import { addDays, startOfWeek, todayISO, addMonths } from '../lib/dates';
import { buildReviews } from '../lib/reviews';
import type { SubjectColor, TopicStatus } from './types';

/** Preenche o app com dados de exemplo (os mesmos do design), relativos à data de hoje. */
export function seedDemo() {
  const today = todayISO();
  const mon = startOfWeek(today);
  const d = (n: number) => addDays(today, n);

  updateSettings({
    ...getSettings(),
    displayName: getSettings().displayName || 'Mariah',
    availability: [60, 120, 60, 180, 120, 60, 120],
    passing: {},
  });

  put('terms', { name: '4º período de Medicina', start: addMonths(today, -3), end: addDays(addMonths(today, 1), 9) });

  const subj = (name: string, color: SubjectColor, order: number) => put('subjects', { name, color, order }).id;
  const fisio = subj('Fisiologia', 'plum', 0);
  const anato = subj('Anatomia', 'sage', 1);
  const bioq = subj('Bioquímica', 'sand', 2);
  const semio = subj('Semiologia', 'sky', 3);
  const saude = subj('Saúde coletiva', 'amber', 4);
  const pato = subj('Patologia', 'rose', 5);

  const topic = (subjectId: string, name: string, status: TopicStatus, studiedOffset?: number, extra: Record<string, unknown> = {}) => {
    const studiedAt = studiedOffset !== undefined ? d(studiedOffset) : undefined;
    const intervals = [1, 7, 21];
    let reviews = studiedAt ? buildReviews(studiedAt, intervals) : [];
    // no exemplo, revisões que já venceram foram feitas em dia (só 'pendingDemo' fica para hoje)
    reviews = reviews.map((r) => (r.due < today && !extra.pendingDemo ? { ...r, doneAt: r.due } : r));
    if (status === 'revisado' && !reviews.some((r) => r.doneAt)) reviews = reviews.map((r, i) => (i === 0 ? { ...r, doneAt: today } : r));
    if (status === 'estudei' && reviews.some((r) => r.doneAt)) status = 'revisado';
    delete extra.pendingDemo;
    return put('topics', {
      subjectId, name, status, studiedAt, summary: '', materials: [], spacedEnabled: true, intervals, reviews, order: 0, ...extra,
    }).id;
  };

  const ciclo = topic(fisio, 'Ciclo cardíaco', 'estudei', -1, {
    group: 'Sistema cardiovascular',
    summary:
      '### Da diástole à ejeção\nO ciclo cardíaco reúne os eventos entre dois batimentos. A abertura e o fechamento das valvas dependem dos gradientes de pressão.\n\n- **Diástole:** relaxamento e enchimento ventricular.\n- **Sístole:** contração isovolumétrica e ejeção.\n- B1: fechamento das valvas AV; B2: semilunares.',
    summarySavedAt: new Date(Date.now() - 86_400_000).toISOString(),
    materials: [{ id: crypto.randomUUID(), name: 'Guyton & Hall - capítulo 9', url: 'https://www.google.com/search?q=Guyton+Hall+cap%C3%ADtulo+9', addedAt: d(-1) }],
  });
  topic(fisio, 'Potencial de ação', 'revisado', -9, { group: 'Fisiologia celular' });
  const debito = topic(fisio, 'Débito cardíaco', 'estudei', -7, { group: 'Sistema cardiovascular', pendingDemo: true });
  topic(fisio, 'Pressão arterial', 'nao_vi', undefined, { group: 'Sistema cardiovascular' });
  topic(fisio, 'Sistema respiratório', 'nao_vi');
  topic(fisio, 'Equilíbrio ácido-base', 'estudei', -5, { group: 'Renal' });
  const membro = topic(anato, 'Membro superior', 'estudei', -3);
  topic(anato, 'Membro inferior', 'nao_vi');
  topic(anato, 'Tórax', 'revisado', -20);
  const enzimas = topic(bioq, 'Enzimas e cinética', 'estudei', -2);
  topic(bioq, 'Glicólise', 'revisado', -15);
  topic(bioq, 'Ciclo de Krebs', 'nao_vi');
  topic(semio, 'Anamnese', 'revisado', -30);
  topic(semio, 'Exame físico cardiovascular', 'nao_vi');
  topic(saude, 'Epidemiologia descritiva', 'estudei', -12);
  topic(saude, 'SUS: princípios', 'revisado', -25);
  topic(pato, 'Inflamação aguda', 'estudei', -8);
  topic(pato, 'Neoplasias', 'nao_vi');

  // Agenda
  put('events', { title: 'Prova de Fisiologia', type: 'prova', subjectId: fisio, date: d(4), time: '08:00', location: 'Sala 204 · Bloco B', notes: 'Conteúdos: ciclo cardíaco, débito cardíaco e controle da pressão arterial.', remindersEnabled: true, reminderDays: [3, 1], reminderTime: '09:00' });
  put('events', { title: 'Relatório de Bioquímica', type: 'entrega', subjectId: bioq, date: d(7), time: '23:59', location: 'Entrega online', remindersEnabled: true, reminderDays: [3, 1], reminderTime: '09:00' });
  put('events', { title: 'Prova prática de Anatomia', type: 'prova', subjectId: anato, date: d(10), time: '10:00', location: 'Laboratório', remindersEnabled: true, reminderDays: [3, 1], reminderTime: '09:00' });

  // Grade
  const cls = (subjectId: string, weekday: number, start: string, end: string, location: string, kind: string) =>
    put('classes', { subjectId, weekday, start, end, location, kind });
  cls(fisio, 1, '08:00', '10:00', 'Sala 204', 'Teórica');
  cls(anato, 1, '10:00', '12:00', 'Laboratório 2', 'Prática');
  cls(anato, 2, '08:00', '10:00', 'Laboratório 2', 'Prática');
  cls(bioq, 2, '10:00', '12:00', 'Sala 108', 'Teórica');
  cls(saude, 2, '14:00', '16:00', 'UBS', 'Prática');
  cls(saude, 2, '16:00', '18:00', 'UBS', 'Prática');
  cls(semio, 3, '08:00', '12:00', 'Hospital-escola', 'Prática');
  cls(fisio, 3, '14:00', '16:00', 'Sala 204', 'Tutoria');
  cls(bioq, 4, '08:00', '10:00', 'Sala 108', 'Teórica');
  cls(anato, 4, '10:00', '12:00', 'Laboratório 2', 'Prática');
  cls(semio, 4, '16:00', '18:00', 'Lab 3', 'Simulação');
  cls(fisio, 5, '08:00', '10:00', 'Sala 204', 'Teórica');
  cls(saude, 5, '10:00', '12:00', 'Sala 302', 'Teórica');

  // Questões (4 semanas, evolução 60% → 75%)
  const q = (subjectId: string, topicId: string | undefined, offset: number, done: number, correct: number) =>
    put('questionLogs', { subjectId, topicId, date: d(offset), done, correct });
  q(fisio, ciclo, -24, 30, 18); q(anato, membro, -22, 20, 12);
  q(fisio, debito, -17, 30, 19); q(bioq, enzimas, -15, 30, 20);
  q(fisio, ciclo, -10, 40, 28); q(anato, membro, -8, 40, 28);
  q(fisio, ciclo, -5, 40, 32); q(fisio, debito, -4, 40, 28); q(anato, membro, -2, 50, 40); q(bioq, enzimas, -1, 30, 20);

  // Planejamento desta semana
  let order = 0;
  const blk = (offset: number, title: string, kind: 'estudo' | 'revisao' | 'questoes', minutes: number, extra: Record<string, unknown> = {}) =>
    put('planBlocks', { date: addDays(mon, offset), title, kind, minutes, done: false, order: order++, ...extra });
  blk(0, 'Enzimas e cinética', 'revisao', 45, { topicId: enzimas, subjectId: bioq, time: '06:00', done: true });
  blk(0, 'Ciclo cardíaco', 'revisao', 30, { topicId: ciclo, subjectId: fisio, time: '14:00' });
  blk(0, 'Membro superior', 'questoes', 45, { topicId: membro, subjectId: anato, time: '15:00' });
  blk(1, 'Débito cardíaco', 'estudo', 120, { topicId: debito, subjectId: fisio });
  blk(2, 'Pressão arterial', 'estudo', 120, { subjectId: fisio });
  blk(2, 'Revisões do dia', 'revisao', 60);
  blk(3, 'Anatomia prática', 'estudo', 120, { subjectId: anato });
  blk(3, 'Bioquímica', 'questoes', 60, { subjectId: bioq });
  blk(4, 'Erros da prova', 'revisao', 60, { subjectId: fisio });
  blk(5, 'Sistema respiratório', 'estudo', 120, { subjectId: fisio });
  blk(5, 'Questões mistas', 'questoes', 60);
  blk(6, 'Revisões do dia', 'revisao', 60);

  // Pomodoro: 6h30 nos últimos 7 dias
  const sess = (subjectId: string, topicId: string | undefined, offset: number, minutes: number, hour = 15) => {
    const start = new Date(); start.setDate(start.getDate() + offset); start.setHours(hour, 0, 0, 0);
    put('sessions', { subjectId, topicId, startedAt: start.toISOString(), date: d(offset), minutes });
  };
  sess(fisio, ciclo, 0, 25, 7); sess(fisio, ciclo, 0, 25, 8);
  sess(anato, membro, -1, 50); sess(fisio, debito, -2, 65); sess(bioq, enzimas, -3, 90); sess(anato, membro, -4, 70); sess(fisio, undefined, -5, 65);

  // Notas
  const ass = (subjectId: string, name: string, offset: number, weight: number, grade: number | null, order: number) =>
    put('assessments', { subjectId, name, date: d(offset), weight, grade, order });
  ass(fisio, 'P1', -31, 3, 7.5, 0); ass(fisio, 'Seminário', -10, 2, 8, 1); ass(fisio, 'P2', 4, 5, null, 2);
  ass(anato, 'P1', -30, 4, 7.5, 0); ass(anato, 'Prática 1', -20, 2, 8, 1); ass(anato, 'Prática 2', 10, 4, null, 2);
  ass(bioq, 'P1', -28, 4, 7, 0); ass(bioq, 'Relatório', -14, 1, 7.5, 1); ass(bioq, 'P2', 7, 5, null, 2);
}
