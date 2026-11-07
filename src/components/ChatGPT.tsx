import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check as CheckIcon, ClipboardPaste, Copy, ExternalLink, FileText, ListChecks, Sparkles, Trash2 } from 'lucide-react';
import { patch, put, remove, useList, useSettings } from '../data/store';
import { useTerm } from '../data/hooks';
import { buildQuizPrompt, buildSummaryPrompt, CHATGPT_URL, copyText, detectResponse, LEVEL_LABEL } from '../lib/chatgpt';
import { fmt } from '../lib/dates';
import { uid } from '../lib/ids';
import { formatPercent } from '../lib/stats';
import { cx, Field, Modal, Segmented, toast } from './ui';
import type { Quiz, QuizLevel, Subject, Topic } from '../data/types';

type Kind = 'summary' | 'quiz';

function useCtx(topic: Topic, subject?: Subject) {
  const settings = useSettings();
  const term = useTerm();
  return { topic, subject, course: settings.course, term: term?.name };
}

/** Seção "Estudar com o ChatGPT" dentro do tema. */
export function StudyWithChatGPT({ topic, subject }: { topic: Topic; subject?: Subject }) {
  const quizzes = useList('quizzes');
  const [generate, setGenerate] = useState<Kind | null>(null);
  const [paste, setPaste] = useState(false);
  const list = useMemo(() => quizzes.filter((q) => q.topicId === topic.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [quizzes, topic.id]);

  return (
    <div>
      <div className="row-between">
        <h3 style={{ fontSize: 18 }} className="row"><Sparkles size={17} className="accent" /> Estudar com o ChatGPT</h3>
      </div>
      <p className="small muted mt-2">Gere um resumo ou questões na sua conta do ChatGPT e cole a resposta aqui. Confira sempre com a bibliografia.</p>
      <div className="ai-actions mt-3">
        <button className="btn btn-secondary btn-sm" onClick={() => setGenerate('summary')}><FileText /> Gerar resumo</button>
        <button className="btn btn-secondary btn-sm" onClick={() => setGenerate('quiz')}><ListChecks /> Gerar questões</button>
        <button className="btn btn-primary btn-sm" onClick={() => setPaste(true)}><ClipboardPaste /> Colar resposta</button>
      </div>

      {list.length > 0 && (
        <div className="quiz-list mt-3">
          {list.map((q) => <QuizRow key={q.id} quiz={q} />)}
        </div>
      )}

      {generate && <GenerateModal kind={generate} topic={topic} subject={subject} onClose={() => setGenerate(null)} onPaste={() => { setGenerate(null); setPaste(true); }} />}
      {paste && <PasteModal topic={topic} onClose={() => setPaste(false)} />}
    </div>
  );
}

function QuizRow({ quiz }: { quiz: Quiz }) {
  const best = quiz.attempts.reduce<number | null>((m, a) => (m === null || a.correct > m ? a.correct : m), null);
  const last = quiz.attempts[quiz.attempts.length - 1];
  const acc = best !== null ? best / quiz.questions.length : null;
  return (
    <div className="quiz-row">
      <ListChecks size={18} className="accent" style={{ flexShrink: 0 }} />
      <div className="grow">
        <strong className="small" style={{ display: 'block' }}>{quiz.questions.length} questões · {LEVEL_LABEL[quiz.level]}</strong>
        <span className="tiny muted">
          Gerado em {fmt(new Date(quiz.createdAt), 'dd MMM')}
          {last ? ` · última tentativa ${fmt(last.date, 'dd MMM')}` : ' · ainda não respondido'}
        </span>
      </div>
      {acc !== null && <span className={cx('badge', acc >= 0.75 ? 'badge-green' : acc >= 0.6 ? 'badge-amber' : 'badge-red')}>Melhor: {formatPercent(acc)}</span>}
      <Link to={`/quiz/${quiz.id}`} className="btn btn-secondary btn-xs">{quiz.attempts.length ? 'Refazer' : 'Responder'}</Link>
      <button
        className="icon-btn"
        aria-label="Excluir questões"
        onClick={() => {
          remove('quizzes', quiz.id);
          toast('Questões excluídas.', { label: 'Desfazer', run: () => put('quizzes', { ...quiz, deleted: false }) });
        }}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

/** Monta o pedido, copia e abre o ChatGPT. */
export function GenerateModal({ kind, topic, subject, wrong, onClose, onPaste }: {
  kind: Kind; topic: Topic; subject?: Subject; wrong?: string[]; onClose: () => void; onPaste: () => void;
}) {
  const ctx = useCtx(topic, subject);
  const [count, setCount] = useState(10);
  const [level, setLevel] = useState<QuizLevel>('intermediario');
  const [focus, setFocus] = useState('');
  const [copied, setCopied] = useState<boolean | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  const prompt = kind === 'summary' ? buildSummaryPrompt(ctx) : buildQuizPrompt(ctx, { count, level, focus, wrong });

  // o link abre o ChatGPT pelo próprio navegador; a cópia acontece no mesmo toque (exigência do iPhone)
  const onOpen = () => {
    if (kind === 'quiz') rememberLevel(topic.id, level);
    copyText(prompt).then(setCopied);
  };

  return (
    <Modal
      title={kind === 'summary' ? 'Gerar resumo no ChatGPT' : wrong?.length ? 'Questões sobre seus erros' : 'Gerar questões no ChatGPT'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
          <span className="spacer" />
          <button className="btn btn-secondary" onClick={onPaste}><ClipboardPaste /> Já tenho a resposta</button>
        </>
      }
    >
      {kind === 'quiz' && (
        <div className="stack" style={{ marginBottom: 18 }}>
          <div className="form-row" style={{ gridTemplateColumns: '1fr 1.6fr' }}>
            <Field label="Quantidade">
              <select className="select" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n} questões</option>)}
              </select>
            </Field>
            <div className="field">
              <span>Nível</span>
              <Segmented<QuizLevel> value={level} onChange={setLevel} options={(['basico', 'intermediario', 'residencia'] as QuizLevel[]).map((l) => ({ value: l, label: l === 'residencia' ? 'Residência' : LEVEL_LABEL[l] }))} />
            </div>
          </div>
          <Field label="Ênfase (opcional)">
            <input className="input" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="Ex.: fisiopatologia, valores normais, casos clínicos" />
          </Field>
          {wrong?.length ? <p className="tiny muted">Inclui as {wrong.length} questões que você errou, para o ChatGPT criar novas sobre os mesmos conceitos.</p> : null}
        </div>
      )}

      <ol className="steps">
        <li>
          <span className="step-num">1</span>
          <div className="grow">
            <strong>Copie o pedido e abra o ChatGPT</strong>
            <div className="row wrap mt-2">
              <a className="btn btn-primary btn-sm" href={CHATGPT_URL} target="_blank" rel="noreferrer" onClick={onOpen}>
                <ExternalLink /> Copiar e abrir ChatGPT
              </a>
              <button className="btn btn-ghost btn-sm" onClick={() => { if (kind === 'quiz') rememberLevel(topic.id, level); copyText(prompt).then((ok) => { setCopied(ok); toast(ok ? 'Pedido copiado.' : 'Não foi possível copiar.'); }); }}>
                <Copy /> Só copiar
              </button>
            </div>
            {copied === true && <p className="tiny success-text mt-2">✓ Pedido copiado</p>}
            {copied === false && <p className="tiny danger-text mt-2">Não deu para copiar automaticamente. Abra “Ver pedido” e copie manualmente.</p>}
          </div>
        </li>
        <li>
          <span className="step-num">2</span>
          <div className="grow">
            <strong>Cole no ChatGPT e envie</strong>
            <p className="tiny muted mt-1">Toque e segure na caixa de mensagem → Colar.</p>
          </div>
        </li>
        <li>
          <span className="step-num">3</span>
          <div className="grow">
            <strong>Copie a resposta e volte aqui</strong>
            <p className="tiny muted mt-1">No ChatGPT, use o botão de copiar abaixo da resposta e toque em “Colar resposta” no tema.</p>
          </div>
        </li>
      </ol>

      <button className="card-link mt-3" onClick={() => setShowPrompt(!showPrompt)}>{showPrompt ? 'Ocultar pedido' : 'Ver pedido'}</button>
      {showPrompt && <textarea className="textarea prompt-box mt-2" readOnly value={prompt} onFocus={(e) => e.currentTarget.select()} />}
    </Modal>
  );
}

/** Recebe a resposta colada e decide se é resumo ou questões. */
export function PasteModal({ topic, onClose }: { topic: Topic; onClose: () => void }) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'replace' | 'append'>(topic.summary.trim() ? 'append' : 'replace');
  const navigate = useNavigate();
  const detected = useMemo(() => detectResponse(text), [text]);

  async function readClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setText(t);
      else toast('A área de transferência está vazia.');
    } catch {
      toast('Toque e segure na caixa abaixo e escolha Colar.');
    }
  }

  function saveSummary() {
    if (detected.kind !== 'summary') return;
    const summary = mode === 'append' && topic.summary.trim() ? `${topic.summary.trim()}\n\n### Complemento (ChatGPT)\n${detected.text}` : detected.text;
    patch('topics', topic.id, { summary, summarySavedAt: new Date().toISOString() });
    toast('Resumo salvo no tema.');
    onClose();
  }

  function saveQuiz(start: boolean) {
    if (detected.kind !== 'quiz') return;
    const q = put('quizzes', {
      topicId: topic.id,
      subjectId: topic.subjectId,
      title: topic.name,
      level: pendingLevel(topic.id),
      questions: detected.quiz.questions.map((x) => ({ ...x, id: uid() })),
      attempts: [],
      createdAt: new Date().toISOString(),
    });
    toast(`${detected.quiz.questions.length} questões salvas.`);
    onClose();
    if (start) navigate(`/quiz/${q.id}`);
  }

  return (
    <Modal
      title="Colar resposta do ChatGPT"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <span className="spacer" />
          {detected.kind === 'summary' && <button className="btn btn-primary" onClick={saveSummary}><CheckIcon /> Salvar resumo</button>}
          {detected.kind === 'quiz' && (
            <>
              <button className="btn btn-secondary" onClick={() => saveQuiz(false)}>Só salvar</button>
              <button className="btn btn-primary" onClick={() => saveQuiz(true)}>Responder agora <ArrowRight /></button>
            </>
          )}
        </>
      }
    >
      <div className="stack">
        <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={readClipboard}><ClipboardPaste /> Colar da área de transferência</button>
        <textarea
          className="textarea"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="…ou cole aqui a resposta inteira do ChatGPT"
          style={{ minHeight: 180, fontSize: 13 }}
        />
        {detected.kind === 'quiz' && (
          <div className="detect detect-ok">
            <ListChecks size={18} />
            <div>
              <strong className="small">{detected.quiz.questions.length} questões encontradas</strong>
              <div className="tiny">
                {detected.quiz.skipped > 0 ? `${detected.quiz.skipped} ${detected.quiz.skipped === 1 ? 'veio incompleta e foi ignorada' : 'vieram incompletas e foram ignoradas'}. ` : ''}
                Prontas para responder no modo quiz.
              </div>
            </div>
          </div>
        )}
        {detected.kind === 'summary' && (
          <>
            <div className="detect">
              <FileText size={18} />
              <div>
                <strong className="small">Resumo · {detected.text.split(/\s+/).filter(Boolean).length} palavras</strong>
                <div className="tiny">
                  {/questoes|alternativas/i.test(text) ? 'Parece que eram questões, mas o formato veio quebrado. Peça ao ChatGPT: “responda só com o JSON”.' : 'Será salvo em “Meu resumo”, onde você pode revisar e editar.'}
                </div>
              </div>
            </div>
            {topic.summary.trim() && (
              <Segmented<'replace' | 'append'> value={mode} onChange={setMode} options={[{ value: 'append', label: 'Adicionar ao meu resumo' }, { value: 'replace', label: 'Substituir' }]} />
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/* o nível não vem na resposta do ChatGPT: guardamos o que foi escolhido ao gerar */
const levelKey = (topicId: string) => `mestudos:quiz-level:${topicId}`;
function rememberLevel(topicId: string, level: QuizLevel) {
  try {
    localStorage.setItem(levelKey(topicId), level);
  } catch {
    /* ignore */
  }
}
function pendingLevel(topicId: string): QuizLevel {
  try {
    const v = localStorage.getItem(levelKey(topicId));
    if (v === 'basico' || v === 'intermediario' || v === 'residencia') return v;
  } catch {
    /* ignore */
  }
  return 'intermediario';
}
