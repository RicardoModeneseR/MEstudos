import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Check as CheckIcon, ChevronLeft, CircleCheck, CircleX, ListChecks, RotateCcw, Sparkles } from 'lucide-react';
import { patch, put, useItem, useList } from '../data/store';
import { useSubjectMap, useToday } from '../data/hooks';
import { GenerateModal, PasteModal } from '../components/ChatGPT';
import { cx, Empty, Progress } from '../components/ui';
import { LEVEL_LABEL } from '../lib/chatgpt';
import { formatPercent } from '../lib/stats';
import type { Quiz } from '../data/types';

interface Progress_ {
  index: number;
  answers: (number | null)[];
  revealed: boolean;
  finished: boolean;
}

const LETTERS = 'ABCDEF';
const key = (id: string) => `mestudos:quiz-progress:${id}`;

function loadProgress(q: Quiz): Progress_ {
  try {
    const raw = localStorage.getItem(key(q.id));
    if (raw) {
      const p = JSON.parse(raw) as Progress_;
      if (p.answers.length === q.questions.length) return p;
    }
  } catch {
    /* ignore */
  }
  return { index: 0, answers: q.questions.map(() => null), revealed: false, finished: false };
}

export function QuizPage() {
  const { id } = useParams();
  const quiz = useItem('quizzes', id);
  if (!quiz || quiz.deleted) {
    return (
      <div className="card">
        <Empty icon={<ListChecks />} title="Questões não encontradas">
          <p className="small"><Link to="/temas">Voltar para Matérias e temas</Link></p>
        </Empty>
      </div>
    );
  }
  return <QuizRunner key={quiz.id} quiz={quiz} />;
}

function QuizRunner({ quiz }: { quiz: Quiz }) {
  const today = useToday();
  const subjects = useSubjectMap();
  const topics = useList('topics');
  const navigate = useNavigate();
  const topic = topics.find((t) => t.id === quiz.topicId);
  const [p, setP] = useState<Progress_>(() => loadProgress(quiz));
  const [selected, setSelected] = useState<number | null>(p.answers[p.index] ?? null);
  const [modal, setModal] = useState<'generate' | 'paste' | null>(null);
  const recorded = useRef(false);

  const total = quiz.questions.length;
  const q = quiz.questions[p.index];
  const correctCount = p.answers.filter((a, i) => a === quiz.questions[i].answer).length;
  const answeredCount = p.answers.filter((a) => a !== null).length;

  useEffect(() => {
    try {
      if (p.finished) localStorage.removeItem(key(quiz.id));
      else localStorage.setItem(key(quiz.id), JSON.stringify(p));
    } catch {
      /* ignore */
    }
  }, [p, quiz.id]);

  function confirm() {
    if (selected === null || p.revealed) return;
    const answers = [...p.answers];
    answers[p.index] = selected;
    setP({ ...p, answers, revealed: true });
  }

  function next() {
    if (p.index + 1 < total) {
      setP({ ...p, index: p.index + 1, revealed: false });
      setSelected(null);
      window.scrollTo({ top: 0 });
    } else {
      finish();
    }
  }

  function finish() {
    if (!recorded.current) {
      recorded.current = true;
      const correct = p.answers.filter((a, i) => a === quiz.questions[i].answer).length;
      patch('quizzes', quiz.id, {
        attempts: [...quiz.attempts, { at: new Date().toISOString(), date: today, answers: p.answers, correct, total }],
      });
      put('questionLogs', { subjectId: quiz.subjectId, topicId: quiz.topicId, date: today, done: total, correct });
    }
    setP({ ...p, finished: true });
    window.scrollTo({ top: 0 });
  }

  function restart() {
    recorded.current = false;
    setP({ index: 0, answers: quiz.questions.map(() => null), revealed: false, finished: false });
    setSelected(null);
  }

  // teclado: 1–5 ou A–E escolhem, Enter confirma/avança
  useEffect(() => {
    if (p.finished || modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toUpperCase();
      const idx = /^[1-6]$/.test(k) ? Number(k) - 1 : LETTERS.indexOf(k);
      if (!p.revealed && idx >= 0 && idx < q.options.length) setSelected(idx);
      if (e.key === 'Enter') (p.revealed ? next : confirm)();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const back = (
    <Link to={topic ? `/temas?tema=${topic.id}` : '/temas'} className="add-link" style={{ marginBottom: 10 }}>
      <ChevronLeft /> {topic?.name ?? 'Temas'}
    </Link>
  );

  if (p.finished) {
    const acc = correctCount / total;
    const wrong = quiz.questions.filter((x, i) => p.answers[i] !== x.answer);
    return (
      <>
        {back}
        <div className="page-head">
          <div>
            <h1>Resultado</h1>
            <p>{topic?.name} · {subjects.get(quiz.subjectId)?.name} · {LEVEL_LABEL[quiz.level]}</p>
          </div>
        </div>
        <div className="grid grid-main-side">
          <div className="stack">
            <section className="card quiz-result">
              <div className="serif quiz-score">{correctCount} <span>de {total}</span></div>
              <div className="row wrap" style={{ justifyContent: 'center' }}>
                <span className={cx('badge', acc >= 0.75 ? 'badge-green' : acc >= 0.6 ? 'badge-amber' : 'badge-red')}>{formatPercent(acc)} de acerto</span>
              </div>
              <p className="small muted mt-3">
                {acc >= 0.85 ? 'Domínio bonito deste tema.' : acc >= 0.6 ? 'Bom caminho. Vale revisar os erros abaixo.' : 'Esse tema merece mais uma visita. Os erros mostram por onde começar.'}
              </p>
              <p className="tiny muted mt-1">Registrado em Questões e desempenho.</p>
              <div className="row wrap mt-4" style={{ justifyContent: 'center' }}>
                <button className="btn btn-secondary" onClick={restart}><RotateCcw /> Refazer</button>
                {wrong.length > 0 && topic && <button className="btn btn-primary" onClick={() => setModal('generate')}><Sparkles /> Novas questões sobre meus erros</button>}
              </div>
            </section>

            <section className="card">
              <div className="card-head"><h2>Revisão das questões</h2></div>
              <div className="stack">
                {quiz.questions.map((x, i) => {
                  const ok = p.answers[i] === x.answer;
                  return (
                    <div key={x.id} className="review-q">
                      <div className="row" style={{ alignItems: 'flex-start' }}>
                        {ok ? <CircleCheck size={18} className="success-text" style={{ flexShrink: 0, marginTop: 1 }} /> : <CircleX size={18} className="danger-text" style={{ flexShrink: 0, marginTop: 1 }} />}
                        <div className="grow">
                          <p className="small" style={{ fontWeight: 500 }}>{i + 1}. {x.stem}</p>
                          <p className="tiny mt-1">
                            {!ok && p.answers[i] !== null && <span className="danger-text">Sua resposta: {LETTERS[p.answers[i]!]}) {x.options[p.answers[i]!]} · </span>}
                            <span className="success-text">Correta: {LETTERS[x.answer]}) {x.options[x.answer]}</span>
                          </p>
                          {!ok && x.explanation && <p className="tiny muted mt-1">{x.explanation}</p>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
          <section className="card hide-tablet">
            <h2 className="card-title">Próximos passos</h2>
            <ul className="small muted next-steps">
              <li>Releia o resumo do tema focando nos erros.</li>
              <li>Peça novas questões sobre os mesmos conceitos.</li>
              <li>Marque o tema como “revisado” quando se sentir segura.</li>
            </ul>
            {topic && <button className="btn btn-secondary btn-sm mt-3" onClick={() => navigate(`/temas?tema=${topic.id}`)}>Abrir o tema</button>}
          </section>
        </div>

        {modal === 'generate' && topic && (
          <GenerateModal kind="quiz" topic={topic} subject={subjects.get(quiz.subjectId)} wrong={wrong.map((w) => w.stem)} onClose={() => setModal(null)} onPaste={() => setModal('paste')} />
        )}
        {modal === 'paste' && topic && <PasteModal topic={topic} onClose={() => setModal(null)} />}
      </>
    );
  }

  const answer = p.answers[p.index];
  const isRight = p.revealed && answer === q.answer;

  return (
    <>
      {back}
      <div className="quiz-wrap">
        <div className="row-between" style={{ marginBottom: 8 }}>
          <span className="small muted">Questão {p.index + 1} de {total}</span>
          <span className="small muted">{correctCount} {correctCount === 1 ? 'acerto' : 'acertos'} · {answeredCount} {answeredCount === 1 ? 'respondida' : 'respondidas'}</span>
        </div>
        <Progress value={(p.index + (p.revealed ? 1 : 0)) / total} />

        <section className="card quiz-card">
          <p className="quiz-stem">{q.stem}</p>
          <div className="quiz-options" role="radiogroup">
            {q.options.map((opt, i) => {
              const state = !p.revealed
                ? selected === i ? 'sel' : ''
                : i === q.answer ? 'correct' : i === answer ? 'wrong' : 'dim';
              return (
                <button key={i} role="radio" aria-checked={selected === i} className={cx('quiz-option', state)} disabled={p.revealed} onClick={() => setSelected(i)}>
                  <span className="quiz-letter">{state === 'correct' ? <CheckIcon size={14} /> : state === 'wrong' ? '×' : LETTERS[i]}</span>
                  <span className="grow">{opt}</span>
                </button>
              );
            })}
          </div>

          {p.revealed && (
            <div className={cx('quiz-expl', isRight ? 'ok' : 'bad')}>
              <strong className="small">{isRight ? 'Isso mesmo!' : `Resposta correta: ${LETTERS[q.answer]}`}</strong>
              {q.explanation && <p className="small mt-1">{q.explanation}</p>}
            </div>
          )}

          <div className="row-between mt-4">
            <span className="tiny faint hide-mobile">Atalhos: A–E para escolher, Enter para confirmar</span>
            {p.revealed ? (
              <button className="btn btn-primary" onClick={next}>{p.index + 1 < total ? 'Próxima' : 'Ver resultado'} <ArrowRight /></button>
            ) : (
              <button className="btn btn-primary" disabled={selected === null} onClick={confirm}>Confirmar</button>
            )}
          </div>
        </section>
        <p className="tiny muted mt-3" style={{ textAlign: 'center' }}>Questões geradas pelo ChatGPT. Na dúvida, confira com a bibliografia.</p>
      </div>
    </>
  );
}
