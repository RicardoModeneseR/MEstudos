import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, BellRing, Plus, Sparkles, Timer, TriangleAlert } from 'lucide-react';
import { patch, useList, useSettings } from '../data/store';
import { useNow, useSubjectMap, useToday } from '../data/hooks';
import { pomodoro, remainingNow, usePomodoro } from '../data/pomodoro';
import { addDays, capitalize, countdown, diffDays, fmt, formatMinutes, greeting, weekdayOf, WEEKDAY_SHORT } from '../lib/dates';
import { completeNext, reviewsForDay } from '../lib/reviews';
import { focusBySubject, formatPercent, questionTotals } from '../lib/stats';
import { weekLoad } from '../lib/planning';
import { seedDemo } from '../data/seed';
import { Check, Empty, Progress, Stat, toast } from '../components/ui';
import { ThemeSwitch } from '../components/Layout';
import type { PlanBlock } from '../data/types';

const KIND_LABEL = { estudo: 'estudo', revisao: 'revisão', questoes: 'questões' } as const;

export function formatClock(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function OverviewPage() {
  const today = useToday();
  const settings = useSettings();
  const subjects = useSubjectMap();
  const topics = useList('topics');
  const events = useList('events');
  const blocks = useList('planBlocks');
  const sessions = useList('sessions');
  const logs = useList('questionLogs');
  const pomo = usePomodoro();
  const navigate = useNavigate();

  const weekFrom = addDays(today, -6);
  const focus = useMemo(() => focusBySubject(sessions, weekFrom, today), [sessions, weekFrom, today]);
  const q = useMemo(() => questionTotals(logs, weekFrom, today), [logs, weekFrom, today]);
  const reviews = useMemo(() => reviewsForDay(topics, today), [topics, today]);
  const upcoming = useMemo(() => events.filter((e) => e.date >= today).sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? ''))), [events, today]);
  const nextExam = upcoming.find((e) => e.type === 'prova');
  const todayBlocks = useMemo(() => blocks.filter((b) => b.date === today).sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99') || a.order - b.order), [blocks, today]);
  const week = useMemo(() => weekLoad(blocks, settings, today), [blocks, settings, today]);
  const doneCount = todayBlocks.filter((b) => b.done).length;
  const plannedMin = todayBlocks.reduce((s, b) => s + b.minutes, 0);
  const todayFocus = sessions.filter((s) => s.date === today);
  const isEmpty = subjects.size === 0 && topics.length === 0 && events.length === 0;

  const pendingReviewsOutsidePlan = reviews.pending.filter((r) => !todayBlocks.some((b) => b.topicId === r.topic.id && b.kind === 'revisao'));

  function toggleBlock(b: PlanBlock, done: boolean) {
    patch('planBlocks', b.id, { done });
    if (done && b.kind === 'revisao' && b.topicId) {
      const t = topics.find((x) => x.id === b.topicId);
      const r = t && reviews.pending.find((p) => p.topic.id === t.id);
      if (t && r) {
        patch('topics', t.id, { reviews: completeNext(t.reviews, today), status: 'revisado' });
        toast(`Revisão de ${t.name} registrada.`);
      }
    }
  }

  function startFocus(b: PlanBlock) {
    const subjectId = b.subjectId ?? topics.find((t) => t.id === b.topicId)?.subjectId;
    if (subjectId) pomodoro.setTarget(subjectId, b.topicId);
    navigate('/pomodoro');
  }

  const name = settings.displayName.split(' ')[0];
  const firstName = name ? `, ${name}` : '';

  if (isEmpty) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1>{greeting()}{firstName}.</h1>
            <p>{capitalize(fmt(today, "EEEE, d 'de' MMMM"))}. Vamos montar seu caderno?</p>
          </div>
        </div>
        <div className="card">
          <Empty icon={<Sparkles />} title="Seu caderno está em branco">
            <p className="small" style={{ maxWidth: 420, margin: '0 auto 16px' }}>
              Comece cadastrando suas matérias e temas, a grade do período e as próximas provas. Se quiser ver como tudo funciona antes, carregue um exemplo.
            </p>
            <div className="row wrap" style={{ justifyContent: 'center' }}>
              <Link to="/temas" className="btn btn-primary"><Plus /> Cadastrar matérias</Link>
              <Link to="/grade" className="btn btn-secondary">Montar a grade</Link>
              <button className="btn btn-ghost" onClick={() => { seedDemo(); toast('Exemplo carregado. Você pode apagar tudo em Preferências.'); }}>
                Carregar exemplo
              </button>
            </div>
          </Empty>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            <span className="hide-mobile">{greeting()}{firstName}.</span>
            <span className="show-mobile">Seu hoje{firstName}.</span>
          </h1>
          <p>
            {capitalize(fmt(today, "EEEE, d 'de' MMMM"))}
            <span className="hide-mobile">. Um pouco de constância, todos os dias.</span>
          </p>
        </div>
        <Link to="/planejamento" className="btn btn-primary hide-mobile"><Plus /> Planejar meu dia</Link>
      </div>

      {pomo.status !== 'idle' && <FocusHero />}

      <div className="grid grid-4 hide-mobile" style={{ marginBottom: 16 }}>
        <Stat label="Foco nos últimos 7 dias" value={formatMinutes(focus.total)} sub={`${fmt(weekFrom, 'dd')}–${fmt(today, 'dd MMM')} · sessões concluídas`} />
        <Stat label="Questões · últimos 7 dias" value={q.done} sub={q.done ? `${q.correct} acertos · ${formatPercent(q.accuracy)} de aproveitamento` : 'Nenhuma registrada ainda'} />
        <Stat
          label="Revisões para hoje"
          value={`${reviews.pending.length + reviews.done.length} ${reviews.pending.length + reviews.done.length === 1 ? 'tema' : 'temas'}`}
          sub={`${reviews.done.length} ${reviews.done.length === 1 ? 'concluído' : 'concluídos'} · ${reviews.pending.length} para revisar`}
        />
        <Stat
          label="Próxima prova"
          value={nextExam ? (diffDays(today, nextExam.date) === 0 ? 'Hoje' : `${diffDays(today, nextExam.date)} ${diffDays(today, nextExam.date) === 1 ? 'dia' : 'dias'}`) : '—'}
          sub={nextExam ? `${subjects.get(nextExam.subjectId ?? '')?.name ?? nextExam.title} · ${fmt(nextExam.date, 'EEEE, dd MMM')}${nextExam.time ? ` às ${nextExam.time.replace(':00', 'h')}` : ''}` : 'Nenhuma prova agendada'}
        />
      </div>

      <div className="mobile-stats show-mobile">
        <div>
          <div className="stat-value">{formatMinutes(todayFocus.reduce((s, x) => s + x.minutes, 0))}</div>
          <div className="tiny muted">{todayFocus.length} {todayFocus.length === 1 ? 'ciclo concluído' : 'ciclos concluídos'} hoje</div>
        </div>
        <div>
          <div className="stat-value">{reviews.pending.length} {reviews.pending.length === 1 ? 'revisão' : 'revisões'}</div>
          <div className="tiny muted">pendente{reviews.pending.length === 1 ? '' : 's'} · {reviews.done.length} já concluída{reviews.done.length === 1 ? '' : 's'}</div>
        </div>
      </div>

      {nextExam && (
        <Link to="/agenda" className="card exam-mini show-mobile">
          <div className="date-block">
            <span className="serif">{fmt(nextExam.date, 'dd')}</span>
            <span className="tiny faint">{fmt(nextExam.date, 'MMM').toUpperCase()}</span>
          </div>
          <div className="grow">
            <strong>{nextExam.title}</strong>
            <div className="tiny muted">{capitalize(fmt(nextExam.date, 'EEEE'))}{nextExam.time ? ` · ${nextExam.time}` : ''}{nextExam.location ? ` · ${nextExam.location}` : ''}</div>
          </div>
          <span className="badge badge-amber">{countdown(today, nextExam.date).replace('Em ', '')}</span>
        </Link>
      )}

      <div className="grid grid-main-side" style={{ marginBottom: 16 }}>
        <section className="card">
          <div className="card-head">
            <h2><span className="hide-mobile">Seu dia, com intenção</span><span className="show-mobile">No seu ritmo</span></h2>
            <Link to="/planejamento" className="card-link">Ver planejamento <ArrowRight size={14} /></Link>
          </div>
          <div className="row-between" style={{ marginBottom: 4 }}>
            <span className="small muted">
              {todayBlocks.length} {todayBlocks.length === 1 ? 'atividade' : 'atividades'} · {formatMinutes(plannedMin)} planejadas
            </span>
            {todayBlocks.length > 0 && <span className="badge badge-green">{doneCount} de {todayBlocks.length} concluídas</span>}
          </div>
          {todayBlocks.length === 0 && pendingReviewsOutsidePlan.length === 0 && (
            <Empty title="Nada planejado para hoje">
              <p className="small">Distribua temas pelos seus horários livres no <Link to="/planejamento">planejamento</Link>.</p>
            </Empty>
          )}
          <div>
            {todayBlocks.map((b) => {
              const subj = subjects.get(b.subjectId ?? topics.find((t) => t.id === b.topicId)?.subjectId ?? '');
              const inFocus = pomo.status !== 'idle' && !b.done && ((b.topicId && pomo.topicId === b.topicId) || (!b.topicId && b.subjectId && pomo.subjectId === b.subjectId));
              return (
                <div key={b.id} className="list-row day-row">
                  <span className="time small muted">{b.time ?? '—'}</span>
                  <Check on={b.done} onChange={(v) => toggleBlock(b, v)} label={`Concluir ${b.title}`} />
                  <div className="grow">
                    <div style={{ fontWeight: 500, textDecoration: b.done ? 'line-through' : undefined, textDecorationColor: 'var(--text-3)' }}>{b.title}</div>
                    <div className="tiny muted">{[subj?.name, KIND_LABEL[b.kind], formatMinutes(b.minutes)].filter(Boolean).join(' · ')}</div>
                  </div>
                  {b.done ? (
                    <span className="badge badge-green">Concluído</span>
                  ) : inFocus ? (
                    <span className="badge badge-plum">Em foco</span>
                  ) : (
                    <>
                      <button className="icon-btn" aria-label="Iniciar foco" title="Iniciar foco" onClick={() => startFocus(b)}><Timer /></button>
                      <span className="badge hide-mobile">Planejado</span>
                    </>
                  )}
                </div>
              );
            })}
            {pendingReviewsOutsidePlan.slice(0, 5).map((r) => (
              <div key={r.topic.id} className="list-row day-row">
                <span className="time small muted">rev.</span>
                <Check
                  on={false}
                  onChange={() => {
                    patch('topics', r.topic.id, { reviews: completeNext(r.topic.reviews, today), status: 'revisado' });
                    toast(`Revisão de ${r.topic.name} registrada.`);
                  }}
                  label={`Marcar ${r.topic.name} como revisado`}
                />
                <Link to={`/temas?tema=${r.topic.id}`} className="grow" style={{ textDecoration: 'none' }}>
                  <div style={{ fontWeight: 500 }}>{r.topic.name}</div>
                  <div className="tiny muted">{subjects.get(r.topic.subjectId)?.name} · revisão de {r.review.intervalDays} {r.review.intervalDays === 1 ? 'dia' : 'dias'}</div>
                </Link>
                <span className={r.overdue ? 'badge badge-amber' : 'badge badge-plum'}>{r.overdue ? 'Atrasada' : 'Revisar hoje'}</span>
              </div>
            ))}
          </div>
          {pendingReviewsOutsidePlan.length > 5 && (
            <Link to="/temas" className="card-link" style={{ display: 'inline-flex', marginTop: 10 }}>
              +{pendingReviewsOutsidePlan.length - 5} revisões pendentes <ArrowRight size={14} />
            </Link>
          )}
          {pomo.status !== 'idle' && pomo.subjectId && (
            <Link to="/pomodoro" className="focus-strip hide-mobile">
              <Timer size={16} />
              <span className="grow">{subjects.get(pomo.subjectId)?.name} · sessão {pomo.status === 'paused' ? 'pausada' : 'em andamento'}</span>
              <FocusClock /> · Voltar ao foco <ArrowRight size={14} />
            </Link>
          )}
        </section>

        <section className="card hide-mobile">
          <div className="card-head">
            <h2>No horizonte</h2>
            <Link to="/agenda" className="card-link">Agenda <ArrowRight size={14} /></Link>
          </div>
          {upcoming.length === 0 && <p className="small muted">Nenhum prazo à vista.</p>}
          {upcoming.slice(0, 3).map((e) => (
            <Link to={`/agenda?evento=${e.id}`} key={e.id} className="horizon-item">
              <div className="date-block">
                <span className="serif">{fmt(e.date, 'dd')}</span>
                <span className="tiny faint">{WEEKDAY_SHORT[weekdayOf(e.date)]} · {fmt(e.date, 'MMM').toUpperCase()}</span>
              </div>
              <div className="grow">
                <strong className="small">{e.title}</strong>
                <div className="tiny muted">{[e.time && (e.type === 'entrega' ? `Até ${e.time}` : e.time), e.location].filter(Boolean).join(' · ')}</div>
                <div className="tiny accent">{countdown(today, e.date)}{e.remindersEnabled ? ' · lembrete ativo' : ''}</div>
              </div>
            </Link>
          ))}
          {upcoming.length > 0 && (
            <div className="tiny muted row" style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
              <BellRing size={14} /> Avisos configurados em cada evento
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-2">
        <section className="card hide-mobile">
          <div className="card-head">
            <h2>Onde seu tempo está indo</h2>
            <Link to="/pomodoro" className="card-link">Ver horas <ArrowRight size={14} /></Link>
          </div>
          {focus.rows.length === 0 && <p className="small muted">Use o Pomodoro para registrar suas horas por matéria.</p>}
          <div className="stack-sm">
            {focus.rows.slice(0, 5).map((r) => (
              <div key={r.subjectId} className="time-row">
                <span className="small muted ellipsis">{subjects.get(r.subjectId)?.name ?? 'Matéria removida'}</span>
                <Progress value={r.minutes / (focus.rows[0]?.minutes || 1)} />
                <span className="small nowrap">{formatMinutes(r.minutes)}</span>
              </div>
            ))}
          </div>
        </section>

        {week.over > 0 ? (
          <section className="card warn-card">
            <h2 className="row" style={{ fontSize: 18 }}><TriangleAlert size={18} /> Sua semana precisa de respiro</h2>
            <p className="small" style={{ margin: '10px 0 16px' }}>
              Você distribuiu {formatMinutes(week.planned)} em {formatMinutes(week.capacity)} livres. Mova {formatMinutes(week.over)} para a próxima semana e mantenha um ritmo possível.
            </p>
            <div className="row-between">
              <span className="tiny">{fmt(week.days[0].date, 'dd')} – {fmt(week.days[6].date, 'dd MMM')} · excesso de {formatMinutes(week.over)}</span>
              <Link to="/planejamento" className="btn btn-secondary btn-sm">Redistribuir</Link>
            </div>
          </section>
        ) : (
          <section className="card hide-mobile">
            <h2 style={{ fontSize: 18 }}>Uma semana possível</h2>
            <p className="small muted" style={{ margin: '10px 0 16px' }}>
              {week.planned > 0
                ? `${formatMinutes(week.planned)} planejadas de ${formatMinutes(week.capacity)} livres. Cabe na sua semana.`
                : 'Ainda não há estudos planejados para esta semana.'}
            </p>
            <Progress value={week.capacity ? week.planned / week.capacity : 0} />
          </section>
        )}
      </div>

      <div className="show-mobile mobile-theme">
        <span className="small muted">Aparência</span>
        <ThemeSwitch />
      </div>
    </>
  );
}

function FocusClock() {
  const pomo = usePomodoro();
  useNow(1000);
  return <span className="nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatClock(remainingNow(pomo))}</span>;
}

function FocusHero() {
  const pomo = usePomodoro();
  const subjects = useSubjectMap();
  const topics = useList('topics');
  const settings = useSettings();
  const topic = topics.find((t) => t.id === pomo.topicId);
  const label = pomo.mode === 'focus' ? [subjects.get(pomo.subjectId ?? '')?.name, topic?.name].filter(Boolean).join(' · ') || 'Foco' : pomo.mode === 'short' ? 'Pausa curta' : 'Pausa longa';
  return (
    <Link to="/pomodoro" className="focus-hero show-mobile">
      <div className="row-between small">
        <span className="row"><Timer size={15} /> {label}</span>
        {pomo.mode === 'focus' && <span>{Math.min(pomo.cycle + 1, settings.pomodoro.cyclesBeforeLong)}º ciclo</span>}
      </div>
      <div className="row-between" style={{ marginTop: 14 }}>
        <span className="serif focus-hero-clock"><FocusClock /></span>
        <span className="row small" style={{ fontWeight: 600 }}>Voltar ao foco <ArrowUpRight size={16} /></span>
      </div>
    </Link>
  );
}
