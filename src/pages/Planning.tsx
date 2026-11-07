import { useMemo, useState } from 'react';
import { Check as CheckIcon, ChevronLeft, ChevronRight, GripVertical, Plus, Shuffle, Trash2, TriangleAlert } from 'lucide-react';
import { patch, put, remove, updateSettings, useList, useSettings } from '../data/store';
import { useSubjectMap, useSubjects, useToday } from '../data/hooks';
import { addDays, fmt, formatMinutes, startOfWeek, weekdayOf, WEEKDAY_LONG, WEEKDAY_SHORT } from '../lib/dates';
import { suggestRedistribution, weekLoad } from '../lib/planning';
import { cx, Field, Modal, Segmented, Stat, SubjectSelect, toast } from '../components/ui';
import type { BlockKind, PlanBlock } from '../data/types';

const KIND_LABEL: Record<BlockKind, string> = { estudo: 'estudo', revisao: 'revisão', questoes: 'questões' };
const DURATIONS = Array.from({ length: 25 }, (_, i) => i * 30); // 0 a 12h

export function PlanningPage() {
  const today = useToday();
  const settings = useSettings();
  const blocks = useList('planBlocks');
  const subjects = useSubjectMap();
  const topics = useList('topics');
  const [weekOf, setWeekOf] = useState(startOfWeek(today));
  const [editing, setEditing] = useState<Partial<PlanBlock> | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropDay, setDropDay] = useState<string | null>(null);

  const week = useMemo(() => weekLoad(blocks, settings, weekOf), [blocks, settings, weekOf]);
  const moves = useMemo(() => (week.over > 0 || week.overDays.length ? suggestRedistribution(blocks, settings, weekOf, today) : []), [blocks, settings, weekOf, today, week]);
  const movedMinutes = moves.reduce((s, m) => s + m.minutes, 0);
  const nextWeekMoves = moves.filter((m) => m.to > week.days[6].date);
  const isThisWeek = weekOf === startOfWeek(today);

  function applyMoves() {
    moves.forEach((m) => patch('planBlocks', m.blockId, { date: m.to }));
    toast(`${moves.length} ${moves.length === 1 ? 'bloco movido' : 'blocos movidos'}.`, {
      label: 'Desfazer',
      run: () => moves.forEach((m) => patch('planBlocks', m.blockId, { date: m.from })),
    });
  }

  function drop(date: string) {
    if (dragId) {
      const b = blocks.find((x) => x.id === dragId);
      if (b && b.date !== date) patch('planBlocks', dragId, { date });
    }
    setDragId(null);
    setDropDay(null);
  }

  const subjectOf = (b: PlanBlock) => subjects.get(b.subjectId ?? topics.find((t) => t.id === b.topicId)?.subjectId ?? '');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Uma semana possível</h1>
          <p>
            {fmt(week.days[0].date, 'dd')} a {fmt(week.days[6].date, "dd 'de' MMMM 'de' yyyy")} · distribua os estudos nos seus horários livres.
          </p>
        </div>
        <div className="row">
          <div className="week-nav">
            <button className="icon-btn" aria-label="Semana anterior" onClick={() => setWeekOf(addDays(weekOf, -7))}><ChevronLeft /></button>
            <button className="small" onClick={() => setWeekOf(startOfWeek(today))} disabled={isThisWeek}>{isThisWeek ? 'Esta semana' : 'Voltar a hoje'}</button>
            <button className="icon-btn" aria-label="Próxima semana" onClick={() => setWeekOf(addDays(weekOf, 7))}><ChevronRight /></button>
          </div>
          <button className="btn btn-primary" onClick={() => setEditing({ date: weekOf < today && isThisWeek ? today : weekOf, kind: 'estudo', minutes: 60 })}>
            <Plus /> <span className="btn-label">Adicionar tema</span>
          </button>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <Stat label="Disponibilidade livre" value={formatMinutes(week.capacity)} sub="Fora das aulas e dos compromissos" />
        <Stat label="Estudo planejado" value={formatMinutes(week.planned)} sub={`${week.days.reduce((s, d) => s + d.blocks.length, 0)} blocos distribuídos na semana`} />
        <Stat
          label={week.over > 0 ? 'Acima da capacidade' : 'Folga na semana'}
          value={week.over > 0 ? formatMinutes(week.over) : formatMinutes(Math.max(0, week.capacity - week.planned))}
          sub={week.overDays.length ? `${week.overDays.map((d) => WEEKDAY_LONG[weekdayOf(d.date)].split('-')[0].toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' e $1')} com excesso` : 'Nenhum dia acima do limite'}
        />
      </div>

      {(week.over > 0 || week.overDays.some((d) => d.date >= today)) && (
        <div className="banner banner-warning" style={{ marginBottom: 16 }}>
          <TriangleAlert />
          <div className="grow">
            <strong className="serif" style={{ fontSize: 16, fontWeight: 600 }}>
              {week.over > 0 ? 'Esta semana não cabe nas suas horas livres.' : 'Alguns dias passaram do limite.'}
            </strong>
            <div className="small">
              {week.over > 0
                ? `${formatMinutes(week.planned)} planejadas − ${formatMinutes(week.capacity)} disponíveis = ${formatMinutes(week.over)} a mais. Redistribua antes de confirmar.`
                : 'A semana cabe no total, mas há dias sobrecarregados. Dá para equilibrar.'}
            </div>
          </div>
          {moves.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={() => document.getElementById('sugestao')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
              <Shuffle /> Redistribuir {formatMinutes(movedMinutes)}
            </button>
          )}
        </div>
      )}

      <div className="week-board">
        {week.days.map((d) => {
          const past = d.date < today;
          return (
            <div
              key={d.date}
              className={cx('card day-col', d.excess > 0 && 'over', d.date === today && 'today', past && 'past', dropDay === d.date && 'drop')}
              onDragOver={(e) => { e.preventDefault(); setDropDay(d.date); }}
              onDragLeave={() => setDropDay((x) => (x === d.date ? null : x))}
              onDrop={(e) => { e.preventDefault(); drop(d.date); }}
            >
              <div className="row-between">
                <span className="tiny muted" style={{ fontWeight: 600 }}>{WEEKDAY_SHORT[weekdayOf(d.date)]}</span>
                <span className="serif day-num">{fmt(d.date, 'dd')}</span>
              </div>
              <div className="tiny success-text mt-2">{formatMinutes(d.capacity)} livres</div>
              <div className={cx('tiny', d.excess > 0 ? 'warning-text' : 'muted')}>
                {formatMinutes(d.planned)} planejadas{d.excess > 0 && ` · +${formatMinutes(d.excess)}`}
              </div>
              <div className="day-blocks">
                {d.blocks.map((b) => (
                  <button
                    key={b.id}
                    draggable
                    onDragStart={(e) => { setDragId(b.id); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => { setDragId(null); setDropDay(null); }}
                    className={cx('plan-block', b.done && 'done', dragId === b.id && 'dragging')}
                    onClick={() => setEditing(b)}
                  >
                    <GripVertical size={12} className="faint grip" />
                    <span className="grow">
                      <span className="plan-title">{b.title}</span>
                      <span className="tiny muted">{[b.time, formatMinutes(b.minutes), KIND_LABEL[b.kind]].filter(Boolean).join(' · ')}</span>
                      {subjectOf(b) && <span className={cx('plan-subj tinted', `c-${subjectOf(b)!.color}`)}>{subjectOf(b)!.name}</span>}
                    </span>
                    {b.done && <CheckIcon size={13} className="success-text" />}
                  </button>
                ))}
              </div>
              <button className="add-link" onClick={() => setEditing({ date: d.date, kind: 'estudo', minutes: 60 })}><Plus /> Adicionar</button>
            </div>
          );
        })}
      </div>

      <div className="grid planning-bottom" style={{ marginTop: 16 }}>
        <AvailabilityCard weekDays={week.days.map((d) => d.date)} />
        <section className="card" id="sugestao">
          <div className="card-head">
            <h2>Sugestão de redistribuição</h2>
            {moves.length > 0 && <span className="tiny accent" style={{ fontWeight: 600 }}>Prévia · não aplicada</span>}
          </div>
          {moves.length === 0 ? (
            <p className="small muted">{week.planned > 0 ? 'Tudo cabe nos seus horários. Nada a mover.' : 'Adicione temas aos dias para ver se a semana cabe.'}</p>
          ) : (
            <>
              <ul className="move-list">
                {moves.map((m) => (
                  <li key={m.blockId} className="small">
                    <strong>{m.title}</strong> ({formatMinutes(m.minutes)}): {WEEKDAY_SHORT[weekdayOf(m.from)].toLowerCase()} {fmt(m.from, 'dd')} → {WEEKDAY_SHORT[weekdayOf(m.to)].toLowerCase()} {fmt(m.to, 'dd/MM')}
                  </li>
                ))}
              </ul>
              <p className="tiny muted mt-2">Revisões e blocos concluídos não são movidos.</p>
              <div className="row-between mt-3 wrap">
                <div className="row">
                  <span className={cx('badge', week.planned - nextWeekMoves.reduce((s, m) => s + m.minutes, 0) <= week.capacity ? 'badge-green' : 'badge-amber')}>
                    Esta semana: {formatMinutes(week.planned - nextWeekMoves.reduce((s, m) => s + m.minutes, 0))} / {formatMinutes(week.capacity)}
                  </span>
                  {nextWeekMoves.length > 0 && <span className="badge">Próxima: +{formatMinutes(nextWeekMoves.reduce((s, m) => s + m.minutes, 0))}</span>}
                </div>
                <button className="btn btn-primary" onClick={applyMoves}><CheckIcon /> Aplicar sugestão</button>
              </div>
            </>
          )}
        </section>
      </div>

      {editing && <BlockModal initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function AvailabilityCard({ weekDays }: { weekDays: string[] }) {
  const settings = useSettings();
  const [weekday, setWeekday] = useState(2);
  const [scope, setScope] = useState<'sempre' | 'semana'>('sempre');
  const date = weekDays.find((d) => weekdayOf(d) === weekday)!;
  const current = scope === 'semana' ? settings.availabilityOverrides[date] ?? settings.availability[weekday] : settings.availability[weekday];
  const [minutes, setMinutes] = useState<number | null>(null);
  const value = minutes ?? current;

  function save() {
    if (scope === 'sempre') {
      const availability = [...settings.availability];
      availability[weekday] = value;
      updateSettings({ availability });
    } else {
      updateSettings({ availabilityOverrides: { ...settings.availabilityOverrides, [date]: value } });
    }
    setMinutes(null);
    toast('Disponibilidade salva.');
  }

  return (
    <section className="card">
      <div className="card-head"><h2>Minha disponibilidade</h2></div>
      <div className="form-row" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
        <Field label="Dia da semana">
          <select className="select" value={weekday} onChange={(e) => { setWeekday(Number(e.target.value)); setMinutes(null); }}>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => <option key={d} value={d}>{WEEKDAY_LONG[d]}</option>)}
          </select>
        </Field>
        <Field label="Horas livres">
          <select className="select" value={value} onChange={(e) => setMinutes(Number(e.target.value))}>
            {[...new Set([...DURATIONS, value])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{m === 0 ? 'Nenhuma' : formatMinutes(m)}</option>)}
          </select>
        </Field>
      </div>
      <div className="row-between mt-3 wrap">
        <Segmented<'sempre' | 'semana'> value={scope} onChange={(s) => { setScope(s); setMinutes(null); }} options={[{ value: 'sempre', label: 'Toda semana' }, { value: 'semana', label: `Só dia ${fmt(date, 'dd/MM')}` }]} />
        <button className="btn btn-secondary btn-sm" disabled={value === current} onClick={save}>Salvar</button>
      </div>
      <p className="hint mt-2">A grade ajuda; você define o tempo real.</p>
    </section>
  );
}

function BlockModal({ initial, onClose }: { initial: Partial<PlanBlock>; onClose: () => void }) {
  const subjects = useSubjects();
  const topics = useList('topics');
  const blocks = useList('planBlocks');
  const [b, setB] = useState<Partial<PlanBlock>>(initial);
  const set = (p: Partial<PlanBlock>) => setB((x) => ({ ...x, ...p }));
  const subjectTopics = topics.filter((t) => !b.subjectId || t.subjectId === b.subjectId).sort((x, y) => x.name.localeCompare(y.name));
  const valid = !!b.title?.trim() && !!b.date && (b.minutes ?? 0) > 0;

  function save() {
    if (!valid) return;
    put('planBlocks', { ...(b as PlanBlock), done: b.done ?? false, order: b.order ?? blocks.length, title: b.title!.trim() });
    onClose();
  }

  return (
    <Modal
      title={initial.id ? 'Editar bloco' : 'Adicionar ao planejamento'}
      onClose={onClose}
      footer={
        <>
          {initial.id && <button className="btn btn-danger" onClick={() => { remove('planBlocks', initial.id!); onClose(); }}><Trash2 /> Excluir</button>}
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!valid} onClick={save}>Salvar</button>
        </>
      }
    >
      <div className="stack">
        <div className="form-row">
          <Field label="Matéria">
            <SubjectSelect subjects={subjects} value={b.subjectId} allowEmpty onChange={(subjectId) => set({ subjectId, topicId: undefined })} />
          </Field>
          <Field label="Tema">
            <select
              className="select"
              value={b.topicId ?? ''}
              onChange={(e) => {
                const t = topics.find((x) => x.id === e.target.value);
                set({ topicId: t?.id, subjectId: t?.subjectId ?? b.subjectId, title: t ? t.name : b.title });
              }}
            >
              <option value="">Livre (sem tema)</option>
              {subjectTopics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Título"><input className="input" value={b.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder="Ex.: Questões mistas" autoFocus={!initial.id} /></Field>
        <Segmented<BlockKind> value={b.kind ?? 'estudo'} onChange={(kind) => set({ kind })} options={[{ value: 'estudo', label: 'Estudo' }, { value: 'revisao', label: 'Revisão' }, { value: 'questoes', label: 'Questões' }]} />
        <div className="form-row">
          <Field label="Dia"><input className="input" type="date" value={b.date ?? ''} onChange={(e) => set({ date: e.target.value })} /></Field>
          <Field label="Horário (opcional)"><input className="input" type="time" value={b.time ?? ''} onChange={(e) => set({ time: e.target.value || undefined })} /></Field>
          <Field label="Duração">
            <select className="select" value={b.minutes ?? 60} onChange={(e) => set({ minutes: Number(e.target.value) })}>
              {[15, 20, 25, 30, 45, 60, 75, 90, 120, 150, 180, 240].map((m) => <option key={m} value={m}>{formatMinutes(m)}</option>)}
            </select>
          </Field>
        </div>
        {initial.id && (
          <label className="row small">
            <input type="checkbox" checked={!!b.done} onChange={(e) => set({ done: e.target.checked })} /> Concluído
          </label>
        )}
      </div>
    </Modal>
  );
}
