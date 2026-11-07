import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CircleCheck, Pause, Pencil, Play, Plus, Square, Trash2 } from 'lucide-react';
import { patch, put, remove, updateSettings, useList, useSettings } from '../data/store';
import { useNow, useSubjectMap, useSubjects, useTerm, useToday } from '../data/hooks';
import { pomodoro, remainingNow, usePomodoro, type PomoMode } from '../data/pomodoro';
import { addDays, fmt, formatMinutes } from '../lib/dates';
import { focusBySubject } from '../lib/stats';
import { cx, Field, Modal, Progress, Segmented, SubjectSelect, toast } from '../components/ui';
import { formatClock } from './Overview';
import type { FocusSession } from '../data/types';

export function PomodoroPage() {
  const pomo = usePomodoro();
  const settings = useSettings();
  const subjects = useSubjects();
  const subjectMap = useSubjectMap();
  const topics = useList('topics');
  const sessions = useList('sessions');
  const today = useToday();
  useNow(250);
  const [stopping, setStopping] = useState<number | null>(null);
  const [history, setHistory] = useState(false);

  useEffect(() => {
    pomodoro.syncDuration();
  }, [settings.pomodoro]);
  useEffect(() => {
    if (!pomo.subjectId && subjects[0]) pomodoro.setTarget(subjects[0].id);
  }, [pomo.subjectId, subjects]);

  const remaining = remainingNow(pomo);
  const progress = 1 - remaining / pomo.durationMs;
  const todaySessions = sessions.filter((s) => s.date === today);
  const todayMinutes = todaySessions.reduce((s, x) => s + x.minutes, 0);
  const subjectTopics = topics.filter((t) => t.subjectId === pomo.subjectId).sort((a, b) => a.name.localeCompare(b.name));
  const N = settings.pomodoro.cyclesBeforeLong;
  const cycleShown = Math.min(pomo.cycle + (pomo.mode === 'focus' ? 1 : 0), N);
  const running = pomo.status === 'running';

  useEffect(() => {
    document.title = pomo.status !== 'idle' ? `${formatClock(remaining)} · MEstudos` : 'MEstudos';
    return () => { document.title = 'MEstudos'; };
  });

  const R = 120;
  const C = 2 * Math.PI * R;

  return (
    <>
      <div className="page-head">
        <div>
          <h1><span className="hide-mobile">Tempo para se concentrar</span><span className="show-mobile">Hora de focar</span></h1>
          <p>
            <span className="hide-mobile">Uma sessão de cada vez. O tempo registrado conta uma história mais honesta.</span>
            <span className="show-mobile">{[subjectMap.get(pomo.subjectId ?? '')?.name, topics.find((t) => t.id === pomo.topicId)?.name].filter(Boolean).join(' · ')}</span>
          </p>
        </div>
        {pomo.status !== 'idle' && <span className={cx('badge', running ? 'badge-green' : 'badge-amber')}>{running ? 'Sessão em andamento' : 'Pausada'}</span>}
      </div>

      <div className="grid grid-main-side" style={{ marginBottom: 16 }}>
        <section className="card">
          <div className="row-between wrap" style={{ marginBottom: 12 }}>
            <Segmented<PomoMode>
              value={pomo.mode}
              onChange={(m) => {
                if (pomo.status !== 'idle' && pomo.mode === 'focus' && pomodoro.elapsedFocusMinutes() > 0) return setStopping(pomodoro.elapsedFocusMinutes());
                pomodoro.setMode(m);
              }}
              options={[{ value: 'focus', label: 'Foco' }, { value: 'short', label: 'Pausa curta' }, { value: 'long', label: 'Pausa longa' }]}
            />
            <span className="small muted">Ciclo {Math.max(1, cycleShown)} de {N}</span>
          </div>

          <div className="pomo-body">
            <div className="ring">
              <svg viewBox="0 0 280 280">
                <circle cx="140" cy="140" r={R} className="ring-track" />
                <circle cx="140" cy="140" r={R} className="ring-bar" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} transform="rotate(-90 140 140)" />
              </svg>
              <div className="ring-center">
                <span className="tiny muted" style={{ letterSpacing: '0.12em' }}>{pomo.mode === 'focus' ? 'HORA DE ESTUDAR' : 'RESPIRE UM POUCO'}</span>
                <span className="ring-clock serif">{formatClock(remaining)}</span>
                <span className="small muted">de {Math.round(pomo.durationMs / 60_000)} minutos</span>
              </div>
            </div>

            <div className="pomo-controls">
              <Field label="Matéria selecionada">
                <SubjectSelect subjects={subjects} value={pomo.subjectId} onChange={(id) => pomodoro.setTarget(id, undefined)} />
              </Field>
              <Field label="Tema desta sessão">
                <select className="select" value={pomo.topicId ?? ''} onChange={(e) => pomodoro.setTarget(pomo.subjectId, e.target.value || undefined)}>
                  <option value="">Sem tema específico</option>
                  {subjectTopics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <div className="row">
                {running ? (
                  <button className="btn btn-primary" onClick={pomodoro.pause}><Pause /> Pausar</button>
                ) : (
                  <button className="btn btn-primary" disabled={pomo.mode === 'focus' && !pomo.subjectId} onClick={pomodoro.start}>
                    <Play /> {pomo.status === 'paused' ? 'Continuar' : 'Iniciar'}
                  </button>
                )}
                <button
                  className="btn btn-secondary"
                  disabled={pomo.status === 'idle'}
                  onClick={() => {
                    const m = pomodoro.elapsedFocusMinutes();
                    if (pomo.mode === 'focus' && m > 0) { pomodoro.pause(); setStopping(m); } else pomodoro.stop(0);
                  }}
                >
                  <Square /> Encerrar
                </button>
              </div>
              {subjects.length === 0 ? (
                <p className="hint">Cadastre uma matéria em <Link to="/temas">Matérias e temas</Link> para registrar o tempo.</p>
              ) : (
                <p className="hint">Ao encerrar, confirme o tempo estudado antes de adicionar ao histórico.</p>
              )}
            </div>
          </div>

          <hr className="divider" />
          <div className="row-between wrap">
            <div>
              <div className="serif" style={{ fontSize: 24 }}>{formatMinutes(todayMinutes)}</div>
              <div className="tiny muted">concluídos hoje · sem a sessão atual</div>
            </div>
            <div className="cycle-dots" aria-label={`${pomo.cycle} de ${N} ciclos`}>
              {Array.from({ length: N }, (_, i) => <i key={i} className={cx(i < pomo.cycle && 'on')} />)}
            </div>
            <span className="badge badge-green">{todaySessions.length} {todaySessions.length === 1 ? 'ciclo concluído' : 'ciclos concluídos'}</span>
          </div>
        </section>

        <TimeBySubject />
      </div>

      <div className="grid grid-2">
        <RhythmCard />
        <section className="card">
          <div className="card-head">
            <h2>Sessões recentes</h2>
            <button className="card-link" onClick={() => setHistory(true)}>Ver histórico <ArrowRight size={14} /></button>
          </div>
          {sessions.length === 0 && <p className="small muted">Nenhuma sessão ainda. Seu primeiro ciclo aparece aqui.</p>}
          {[...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 4).map((s) => <SessionRow key={s.id} s={s} />)}
          <p className="tiny muted mt-2">Você pode editar ou excluir uma sessão pelo histórico.</p>
        </section>
      </div>

      {stopping !== null && <StopModal initial={stopping} onClose={() => setStopping(null)} />}
      {history && <HistoryModal onClose={() => setHistory(false)} />}
    </>
  );
}

function SessionRow({ s, onEdit }: { s: FocusSession; onEdit?: () => void }) {
  const subjects = useSubjectMap();
  const topics = useList('topics');
  const today = useToday();
  const d = new Date(s.startedAt);
  return (
    <div className="list-row small" style={{ gap: 10 }}>
      <CircleCheck size={16} className="success-text" />
      <span className="muted nowrap" style={{ width: 92 }}>{s.date === today ? 'Hoje' : fmt(s.date, 'dd MMM')} · {fmt(d, 'HH:mm')}</span>
      <span className="grow ellipsis">{[subjects.get(s.subjectId)?.name, topics.find((t) => t.id === s.topicId)?.name].filter(Boolean).join(' · ')}</span>
      <strong className="accent nowrap">{formatMinutes(s.minutes)}</strong>
      {onEdit && <button className="icon-btn" aria-label="Editar sessão" onClick={onEdit}><Pencil size={14} /></button>}
    </div>
  );
}

function TimeBySubject() {
  const today = useToday();
  const term = useTerm();
  const sessions = useList('sessions');
  const subjects = useSubjectMap();
  const [range, setRange] = useState<'7' | '30' | 'term'>('7');
  const from = range === '7' ? addDays(today, -6) : range === '30' ? addDays(today, -29) : term?.start ?? '0000-01-01';
  const data = useMemo(() => focusBySubject(sessions, from, today), [sessions, from, today]);
  return (
    <section className="card">
      <div className="card-head"><h2>Seu tempo por matéria</h2></div>
      <select className="select input-sm" value={range} onChange={(e) => setRange(e.target.value as typeof range)} aria-label="Período">
        <option value="7">{fmt(addDays(today, -6), 'dd')}–{fmt(today, 'dd MMM')} · últimos 7 dias</option>
        <option value="30">Últimos 30 dias</option>
        <option value="term">Período inteiro</option>
      </select>
      <div className="serif accent" style={{ fontSize: 40, marginTop: 14, lineHeight: 1.1 }}>{formatMinutes(data.total)}</div>
      <div className="small muted" style={{ marginBottom: 14 }}>Horas de foco concluídas</div>
      <div className="stack">
        {data.rows.map((r) => (
          <div key={r.subjectId}>
            <div className="row-between small"><strong style={{ fontWeight: 600 }}>{subjects.get(r.subjectId)?.name ?? 'Matéria removida'}</strong><span>{formatMinutes(r.minutes)}</span></div>
            <div className="mt-1"><Progress value={r.minutes / (data.rows[0]?.minutes || 1)} /></div>
            <div className="tiny muted mt-1">{Math.round(r.share * 100)}% do tempo de estudo</div>
          </div>
        ))}
        {data.rows.length === 0 && <p className="small muted">Sem sessões nesse período.</p>}
      </div>
      <p className="tiny muted mt-4">Pausas não entram no registro. Sessões em andamento só contam ao serem concluídas.</p>
    </section>
  );
}

function RhythmCard() {
  const settings = useSettings();
  const [p, setP] = useState(settings.pomodoro);
  useEffect(() => {
    setP(settings.pomodoro);
  }, [settings.pomodoro]);
  const preset = p.focus === 25 && p.short === 5 ? '25' : p.focus === 50 && p.short === 10 ? '50' : 'custom';
  const dirty = JSON.stringify(p) !== JSON.stringify(settings.pomodoro);
  const opt = (xs: number[], v: number) => [...new Set([...xs, v])].sort((a, b) => a - b);
  return (
    <section className="card">
      <div className="card-head"><h2>Seu ritmo</h2></div>
      <Segmented<string>
        value={preset}
        onChange={(v) => { if (v === '25') setP({ ...p, focus: 25, short: 5, long: 15 }); if (v === '50') setP({ ...p, focus: 50, short: 10, long: 20 }); }}
        options={[{ value: '25', label: '25 / 5 min' }, { value: '50', label: '50 / 10 min' }, { value: 'custom', label: 'Personalizar' }]}
      />
      <div className="form-row mt-3" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Field label="Foco"><select className="select" value={p.focus} onChange={(e) => setP({ ...p, focus: Number(e.target.value) })}>{opt([15, 20, 25, 30, 35, 40, 45, 50, 60, 75, 90], p.focus).map((m) => <option key={m} value={m}>{m} min</option>)}</select></Field>
        <Field label="Pausa curta"><select className="select" value={p.short} onChange={(e) => setP({ ...p, short: Number(e.target.value) })}>{opt([3, 5, 10, 15], p.short).map((m) => <option key={m} value={m}>{m} min</option>)}</select></Field>
        <Field label="Pausa longa"><select className="select" value={p.long} onChange={(e) => setP({ ...p, long: Number(e.target.value) })}>{opt([10, 15, 20, 25, 30], p.long).map((m) => <option key={m} value={m}>{m} min</option>)}</select></Field>
      </div>
      <div className="row-between mt-3">
        <label className="small muted row">
          Pausa longa após
          <select className="select input-sm" style={{ width: 70 }} value={p.cyclesBeforeLong} onChange={(e) => setP({ ...p, cyclesBeforeLong: Number(e.target.value) })}>
            {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          ciclos
        </label>
        <button className="btn btn-secondary btn-sm" disabled={!dirty} onClick={() => { updateSettings({ pomodoro: p }); toast('Ritmo salvo.'); }}>Salvar ritmo</button>
      </div>
    </section>
  );
}

function StopModal({ initial, onClose }: { initial: number; onClose: () => void }) {
  const [minutes, setMinutes] = useState(String(initial));
  return (
    <Modal
      title="Encerrar sessão"
      onClose={() => { onClose(); }}
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => { pomodoro.stop(0); onClose(); }}>Descartar</button>
          <span className="spacer" />
          <button className="btn btn-secondary" onClick={() => { pomodoro.start(); onClose(); }}>Continuar focando</button>
          <button className="btn btn-primary" onClick={() => { pomodoro.stop(Math.max(0, Number(minutes) || 0)); toast('Sessão registrada.'); onClose(); }}>Registrar</button>
        </>
      }
    >
      <p className="small muted" style={{ marginBottom: 12 }}>Confirme quanto tempo você realmente estudou. Só o tempo de foco entra no histórico.</p>
      <Field label="Minutos estudados">
        <input className="input" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} autoFocus />
      </Field>
    </Modal>
  );
}

function HistoryModal({ onClose }: { onClose: () => void }) {
  const sessions = useList('sessions');
  const subjects = useSubjects();
  const topics = useList('topics');
  const today = useToday();
  const [edit, setEdit] = useState<Partial<FocusSession> | null>(null);
  const sorted = [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  if (edit) {
    const valid = !!edit.subjectId && (edit.minutes ?? 0) > 0 && !!edit.date;
    return (
      <Modal
        title={edit.id ? 'Editar sessão' : 'Adicionar sessão'}
        onClose={() => setEdit(null)}
        footer={
          <>
            {edit.id && <button className="btn btn-danger" onClick={() => { remove('sessions', edit.id!); setEdit(null); }}><Trash2 /> Excluir</button>}
            <span className="spacer" />
            <button className="btn btn-ghost" onClick={() => setEdit(null)}>Voltar</button>
            <button
              className="btn btn-primary"
              disabled={!valid}
              onClick={() => {
                const time = edit.startedAt ? fmt(new Date(edit.startedAt), 'HH:mm') : '12:00';
                const startedAt = new Date(`${edit.date}T${time}`).toISOString();
                if (edit.id) patch('sessions', edit.id, { ...edit, startedAt });
                else put('sessions', { ...(edit as FocusSession), startedAt });
                setEdit(null);
              }}
            >
              Salvar
            </button>
          </>
        }
      >
        <div className="stack">
          <Field label="Matéria"><SubjectSelect subjects={subjects} value={edit.subjectId} onChange={(subjectId) => setEdit({ ...edit, subjectId, topicId: undefined })} /></Field>
          <Field label="Tema">
            <select className="select" value={edit.topicId ?? ''} onChange={(e) => setEdit({ ...edit, topicId: e.target.value || undefined })}>
              <option value="">Sem tema específico</option>
              {topics.filter((t) => t.subjectId === edit.subjectId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <div className="form-row">
            <Field label="Data"><input className="input" type="date" max={today} value={edit.date ?? ''} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></Field>
            <Field label="Minutos"><input className="input" inputMode="numeric" value={edit.minutes ?? ''} onChange={(e) => setEdit({ ...edit, minutes: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></Field>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Histórico de sessões" onClose={onClose}>
      <button className="btn btn-secondary btn-sm" style={{ marginBottom: 8 }} onClick={() => setEdit({ date: today, minutes: 25, subjectId: subjects[0]?.id })}><Plus /> Adicionar sessão manual</button>
      {sorted.length === 0 && <p className="small muted">Nenhuma sessão registrada.</p>}
      {sorted.slice(0, 200).map((s) => <SessionRow key={s.id} s={s} onEdit={() => setEdit(s)} />)}
    </Modal>
  );
}
