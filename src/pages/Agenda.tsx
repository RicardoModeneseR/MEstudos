import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Calendar, ChevronLeft, ChevronRight, Flag, MapPin, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { put, remove, useList } from '../data/store';
import { useSubjectMap, useSubjects, useToday } from '../data/hooks';
import {
  addDays, addMonths, capitalize, countdown, diffDays, fmt, monthGrid, startOfMonth, weekDates, weekdayOf, WEEKDAY_SHORT,
} from '../lib/dates';
import { reviewsInRange } from '../lib/reviews';
import { cx, DayChips, Empty, Field, Modal, Segmented, SubjectSelect, toast, Toggle } from '../components/ui';
import { enablePush, notificationsSupported } from '../lib/notify';
import type { EventType, StudyEvent } from '../data/types';

type View = 'dia' | 'semana' | 'mes' | 'ano';

interface CalItem {
  key: string;
  kind: 'prova' | 'entrega' | 'outro' | 'revisao' | 'aula';
  date: string;
  time?: string;
  label: string;
  short?: string;
  eventId?: string;
  topicId?: string;
  done?: boolean;
}

const TYPE_LABEL: Record<EventType, string> = { prova: 'Prova', entrega: 'Entrega', outro: 'Outro' };

export function AgendaPage() {
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>(() => (window.matchMedia('(max-width: 900px)').matches ? 'semana' : 'mes'));
  const [cursor, setCursor] = useState(today);
  const [subjectFilter, setSubjectFilter] = useState<string | undefined>();
  const [selectedId, setSelectedId] = useState<string | undefined>(params.get('evento') ?? undefined);
  const [editing, setEditing] = useState<Partial<StudyEvent> | null>(null);

  const events = useList('events');
  const topics = useList('topics');
  const classes = useList('classes');
  const subjects = useSubjects();
  const subjectMap = useSubjectMap();

  useEffect(() => {
    const id = params.get('evento');
    if (id) {
      setSelectedId(id);
      const ev = events.find((e) => e.id === id);
      if (ev) setCursor(ev.date);
      params.delete('evento');
      setParams(params, { replace: true });
    }
  }, [params, setParams, events]);

  const filteredEvents = useMemo(() => events.filter((e) => !subjectFilter || e.subjectId === subjectFilter), [events, subjectFilter]);
  const upcoming = useMemo(() => filteredEvents.filter((e) => e.date >= today).sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? ''))), [filteredEvents, today]);
  const selected = events.find((e) => e.id === selectedId) ?? upcoming[0];

  const range = useMemo(() => {
    if (view === 'dia') return [cursor, cursor];
    if (view === 'semana') { const w = weekDates(cursor); return [w[0], w[6]]; }
    if (view === 'mes') { const g = monthGrid(cursor); return [g[0], g[41]]; }
    const y = cursor.slice(0, 4);
    return [`${y}-01-01`, `${y}-12-31`];
  }, [view, cursor]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    const add = (it: CalItem) => map.set(it.date, [...(map.get(it.date) ?? []), it]);
    for (const e of filteredEvents) {
      if (e.date < range[0] || e.date > range[1]) continue;
      add({ key: e.id, kind: e.type, date: e.date, time: e.time, label: e.title, eventId: e.id });
    }
    const ts = topics.filter((t) => !subjectFilter || t.subjectId === subjectFilter);
    for (const r of reviewsInRange(ts, range[0], range[1])) {
      add({ key: `${r.topic.id}-${r.index}`, kind: 'revisao', date: r.review.doneAt ?? r.review.due, label: `Revisão · ${r.topic.name}`, short: r.topic.name, topicId: r.topic.id, done: !!r.review.doneAt });
    }
    if (view === 'dia') {
      for (const c of classes) {
        if (c.weekday !== weekdayOf(cursor) || (subjectFilter && c.subjectId !== subjectFilter)) continue;
        if ((c.validFrom && cursor < c.validFrom) || (c.validUntil && cursor > c.validUntil)) continue;
        add({ key: c.id, kind: 'aula', date: cursor, time: c.start, label: `${subjectMap.get(c.subjectId)?.name ?? 'Aula'} · ${c.kind ?? 'aula'}${c.location ? ` · ${c.location}` : ''}` });
      }
    }
    for (const list of map.values()) list.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
    return map;
  }, [filteredEvents, topics, classes, range, view, cursor, subjectFilter, subjectMap]);

  const move = (dir: number) => {
    if (view === 'dia') setCursor(addDays(cursor, dir));
    else if (view === 'semana') setCursor(addDays(cursor, 7 * dir));
    else if (view === 'mes') setCursor(addMonths(startOfMonth(cursor), dir));
    else setCursor(addMonths(cursor, 12 * dir));
  };

  const title =
    view === 'dia' ? capitalize(fmt(cursor, "EEEE, d 'de' MMMM"))
    : view === 'semana' ? `${fmt(range[0], 'd MMM')} – ${fmt(range[1], "d MMM yyyy")}`
    : view === 'mes' ? capitalize(fmt(cursor, 'MMMM yyyy'))
    : cursor.slice(0, 4);

  const openItem = (it: CalItem) => {
    if (it.eventId) {
      setSelectedId(it.eventId);
      if (window.matchMedia('(max-width: 1100px)').matches) setEditing(events.find((e) => e.id === it.eventId) ?? null);
    }
  };

  const newEvent = (date = cursor) => setEditing({ type: 'prova', date, time: '08:00', remindersEnabled: true, reminderDays: [3, 1], reminderTime: '09:00', subjectId: subjectFilter });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Agenda</h1>
          <p>Provas, entregas e revisões. Tudo com tempo para se preparar.</p>
        </div>
        <button className="btn btn-primary" onClick={() => newEvent(today)}><Plus /> <span className="btn-label">Novo evento</span></button>
      </div>

      <div className="row-between wrap" style={{ marginBottom: 16 }}>
        <Segmented<View> value={view} onChange={setView} options={[{ value: 'dia', label: 'Diária' }, { value: 'semana', label: 'Semanal' }, { value: 'mes', label: 'Mensal' }, { value: 'ano', label: 'Anual' }]} />
        <div className="row">
          <SubjectSelect subjects={subjects} value={subjectFilter} onChange={setSubjectFilter} allowEmpty emptyLabel="Todas as matérias" className="select input-sm" />
          <button className="btn btn-secondary btn-sm" onClick={() => setCursor(today)}><Calendar /> Hoje</button>
        </div>
      </div>

      <div className="grid grid-main-side">
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h2 className="cal-title">{title}</h2>
              <div className="row" style={{ gap: 2 }}>
                <button className="icon-btn" aria-label="Anterior" onClick={() => move(-1)}><ChevronLeft /></button>
                <button className="icon-btn" aria-label="Próximo" onClick={() => move(1)}><ChevronRight /></button>
              </div>
            </div>
            <div className="legend tiny muted">
              <span><i className="lg prova" /> Prova</span>
              <span><i className="lg entrega" /> Entrega</span>
              <span><i className="lg revisao" /> Revisão</span>
              {view === 'dia' && <span><i className="lg aula" /> Aula</span>}
            </div>

            {view === 'mes' && (
              <div className="month">
                {['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'].map((d) => <div key={d} className="month-dow">{d}</div>)}
                {monthGrid(cursor).map((d) => {
                  const items = itemsByDay.get(d) ?? [];
                  const out = d.slice(0, 7) !== cursor.slice(0, 7);
                  const hasExam = items.some((i) => i.kind === 'prova');
                  return (
                    <div
                      key={d}
                      className={cx('month-cell', out && 'out', d === today && 'today', hasExam && 'exam-day')}
                      onDoubleClick={() => newEvent(d)}
                      onClick={() => { if (window.matchMedia('(max-width: 900px)').matches) { setCursor(d); setView('dia'); } }}
                    >
                      <span className="month-num">{Number(d.slice(8))}</span>
                      <div className="month-items">
                        {items.slice(0, 3).map((it) => (
                          <button key={it.key} className={cx('cal-pill', it.kind, it.done && 'done')} onClick={(e) => { e.stopPropagation(); openItem(it); }} title={it.label}>
                            {it.time && it.kind !== 'revisao' ? `${it.time.replace(':00', 'h')} · ` : ''}{it.short ?? it.label}
                          </button>
                        ))}
                        {items.length > 3 && <span className="tiny faint">+{items.length - 3}</span>}
                      </div>
                      <div className="month-dots">{items.slice(0, 4).map((it) => <i key={it.key} className={cx('lg', it.kind)} />)}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {view === 'semana' && (
              <>
                <div className="week-strip">
                  {weekDates(cursor).map((d) => (
                    <button key={d} className={cx('week-day', d === today && 'today', d === cursor && 'sel')} onClick={() => setCursor(d)}>
                      <span className="tiny">{WEEKDAY_SHORT[weekdayOf(d)].slice(0, 1)}</span>
                      <span className="serif">{Number(d.slice(8))}</span>
                      {(itemsByDay.get(d) ?? []).length > 0 && <i />}
                    </button>
                  ))}
                </div>
                <div className="week-cols">
                  {weekDates(cursor).map((d) => (
                    <div key={d} className={cx('week-col', d === today && 'today')}>
                      <div className="week-col-head">
                        <span className="tiny muted">{WEEKDAY_SHORT[weekdayOf(d)]}</span>
                        <span className="serif">{Number(d.slice(8))}</span>
                      </div>
                      {(itemsByDay.get(d) ?? []).map((it) => (
                        <button key={it.key} className={cx('cal-pill', it.kind, it.done && 'done')} onClick={() => openItem(it)}>
                          {it.time && <b>{it.time} </b>}{it.label}
                        </button>
                      ))}
                      <button className="add-link tiny" onClick={() => newEvent(d)}><Plus /> Evento</button>
                    </div>
                  ))}
                </div>
                <div className="show-mobile">
                  <DayList items={itemsByDay.get(cursor) ?? []} onOpen={openItem} empty="Nada marcado para este dia." />
                </div>
              </>
            )}

            {view === 'dia' && <DayList items={itemsByDay.get(cursor) ?? []} onOpen={openItem} empty="Dia livre. Nenhuma aula, prova ou revisão." />}

            {view === 'ano' && (
              <div className="year">
                {Array.from({ length: 12 }, (_, m) => `${cursor.slice(0, 4)}-${String(m + 1).padStart(2, '0')}-01`).map((first) => (
                  <div key={first} className="year-month">
                    <button className="year-title" onClick={() => { setCursor(first); setView('mes'); }}>{capitalize(fmt(first, 'MMMM'))}</button>
                    <div className="year-grid">
                      {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, i) => <span key={i} className="faint">{d}</span>)}
                      {monthGrid(first).slice(0, 42).map((d) => {
                        const items = itemsByDay.get(d) ?? [];
                        const out = d.slice(0, 7) !== first.slice(0, 7);
                        const kind = items.find((i) => i.kind === 'prova')?.kind ?? items.find((i) => i.kind === 'entrega')?.kind ?? items[0]?.kind;
                        return (
                          <button
                            key={d}
                            className={cx('year-day', out && 'out', d === today && 'today', !out && kind && `has ${kind}`)}
                            onClick={() => { if (!out) { setCursor(d); setView('dia'); } }}
                            title={items.map((i) => i.label).join('\n')}
                            disabled={out}
                          >
                            {out ? '' : Number(d.slice(8))}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="tiny muted row" style={{ marginTop: 14 }}>
              <RefreshCw size={13} /> Revisões automáticas aparecem após marcar um tema como “estudei”.
            </p>
          </section>

          <section className="card upcoming-bar">
            <h2 className="row" style={{ fontSize: 17 }}><Flag size={16} /> <span className="hide-mobile" style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600 }}>A seguir</span><span className="show-mobile">Próximos prazos</span></h2>
            {upcoming.length === 0 && <span className="small muted">Nenhum prazo à frente.</span>}
            {upcoming.slice(0, 6).map((e) => (
              <button key={e.id} className={cx('upcoming-item', selected?.id === e.id && 'sel')} onClick={() => openItem({ key: e.id, kind: e.type, date: e.date, label: e.title, eventId: e.id })}>
                <div className="date-block">
                  <span className="serif">{fmt(e.date, 'dd')}</span>
                  <span className="tiny faint">{WEEKDAY_SHORT[weekdayOf(e.date)]}</span>
                </div>
                <div className="grow" style={{ textAlign: 'left' }}>
                  <strong className="small">{e.title}</strong>
                  <div className="tiny muted">{[e.time, e.location].filter(Boolean).join(' · ')}</div>
                </div>
                <span className={cx('badge', diffDays(today, e.date) <= 3 ? 'badge-amber' : 'badge-plum')}>{countdown(today, e.date)}</span>
              </button>
            ))}
          </section>
        </div>

        <aside className="stack hide-tablet">
          {selected ? (
            <EventPanel key={selected.id} event={selected} onEdit={() => setEditing(selected)} />
          ) : (
            <div className="card">
              <Empty icon={<Calendar />} title="Nenhum evento">
                <p className="small">Cadastre provas e entregas para ver a contagem regressiva e receber avisos.</p>
              </Empty>
            </div>
          )}
        </aside>
      </div>

      {editing && <EventModal initial={editing} onClose={() => setEditing(null)} onSaved={(id) => { setSelectedId(id); setEditing(null); }} />}
    </>
  );
}

function DayList({ items, onOpen, empty }: { items: CalItem[]; onOpen: (it: CalItem) => void; empty: string }) {
  const topics = useList('topics');
  if (items.length === 0) return <p className="small muted" style={{ padding: '16px 0' }}>{empty}</p>;
  return (
    <div className="day-list">
      {items.map((it) => {
        const content = (
          <>
            <span className="small muted time">{it.time ?? (it.kind === 'revisao' ? 'rev.' : '—')}</span>
            <i className={cx('lg', it.kind)} />
            <span className="grow" style={{ textAlign: 'left', textDecoration: it.done ? 'line-through' : undefined }}>{it.label}</span>
            {it.done && <span className="badge badge-green">Feita</span>}
          </>
        );
        if (it.topicId && topics.some((t) => t.id === it.topicId)) {
          return <Link key={it.key} to={`/temas?tema=${it.topicId}`} className="list-row day-list-row">{content}</Link>;
        }
        return <button key={it.key} className="list-row day-list-row" onClick={() => onOpen(it)} disabled={!it.eventId}>{content}</button>;
      })}
    </div>
  );
}

function EventPanel({ event, onEdit }: { event: StudyEvent; onEdit: () => void }) {
  const today = useToday();
  const subjects = useSubjectMap();
  const [days, setDays] = useState(event.reminderDays);
  const [time, setTime] = useState(event.reminderTime);
  const [enabled, setEnabled] = useState(event.remindersEnabled);
  const dirty = enabled !== event.remindersEnabled || time !== event.reminderTime || days.join() !== event.reminderDays.join();

  return (
    <>
      <section className="card">
        <div className="card-head" style={{ alignItems: 'flex-start' }}>
          <h2 className="card-title">{event.title}</h2>
          <button className="icon-btn" onClick={onEdit} aria-label="Editar"><Pencil /></button>
        </div>
        <div className="row-between" style={{ marginBottom: 16 }}>
          <span className={cx('badge', event.type === 'prova' ? 'badge-plum' : event.type === 'entrega' ? 'badge-amber' : '')}>{TYPE_LABEL[event.type]}</span>
          <span className={cx('badge', diffDays(today, event.date) <= 3 && diffDays(today, event.date) >= 0 ? 'badge-amber' : 'badge-plum')}>{countdown(today, event.date)}</span>
        </div>
        <dl className="details">
          <dt>Data e horário</dt>
          <dd><Calendar size={14} /> {fmt(event.date, 'dd/MM/yyyy')}{event.time ? ` · ${event.time}` : ''}</dd>
          {event.subjectId && (<><dt>Matéria</dt><dd>{subjects.get(event.subjectId)?.name}</dd></>)}
          {event.location && (<><dt>Local</dt><dd><MapPin size={14} /> {event.location}</dd></>)}
        </dl>
        {event.notes && <p className="small muted" style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}>{event.notes}</p>}
        <button className="btn btn-secondary mt-4" onClick={onEdit}><Pencil /> Editar evento</button>
      </section>

      <section className="card">
        <div className="card-head"><h2 className="card-title">Lembretes</h2></div>
        <div className="row-between" style={{ marginBottom: 12 }}>
          <span className="small">Avisar antes do evento</span>
          <Toggle on={enabled} onChange={setEnabled} label="Ativar lembretes" />
        </div>
        {enabled && (
          <div className="stack">
            <DayChips days={days} onChange={setDays} />
            <Field label="Horário do aviso" hint="Notificação no iPhone e no notebook.">
              <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
        )}
        <button
          className="btn btn-primary btn-sm mt-4"
          disabled={!dirty}
          onClick={async () => {
            put('events', { ...event, remindersEnabled: enabled, reminderDays: days, reminderTime: time });
            toast('Lembretes salvos.');
            if (enabled && notificationsSupported() && Notification.permission === 'default') await enablePush();
          }}
        >
          Salvar lembretes
        </button>
      </section>
    </>
  );
}

function EventModal({ initial, onClose, onSaved }: { initial: Partial<StudyEvent>; onClose: () => void; onSaved: (id: string) => void }) {
  const subjects = useSubjects();
  const [ev, setEv] = useState<Partial<StudyEvent>>(initial);
  const set = (p: Partial<StudyEvent>) => setEv((e) => ({ ...e, ...p }));
  const valid = !!ev.title?.trim() && !!ev.date;

  function save() {
    if (!valid) return;
    const saved = put('events', {
      ...(ev as StudyEvent),
      title: ev.title!.trim(),
      type: ev.type ?? 'prova',
      remindersEnabled: ev.remindersEnabled ?? true,
      reminderDays: ev.reminderDays ?? [3, 1],
      reminderTime: ev.reminderTime ?? '09:00',
    });
    toast(initial.id ? 'Evento atualizado.' : 'Evento criado.');
    onSaved(saved.id);
  }

  return (
    <Modal
      title={initial.id ? 'Editar evento' : 'Novo evento'}
      onClose={onClose}
      footer={
        <>
          {initial.id && (
            <button className="btn btn-danger" onClick={() => { remove('events', initial.id!); toast('Evento excluído.'); onClose(); }}>
              <Trash2 /> Excluir
            </button>
          )}
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!valid} onClick={save}>Salvar</button>
        </>
      }
    >
      <div className="stack">
        <Field label="Título">
          <input className="input" autoFocus value={ev.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder="Ex.: Prova de Fisiologia" onKeyDown={(e) => e.key === 'Enter' && save()} />
        </Field>
        <Segmented<EventType> value={ev.type ?? 'prova'} onChange={(type) => set({ type })} options={[{ value: 'prova', label: 'Prova' }, { value: 'entrega', label: 'Entrega' }, { value: 'outro', label: 'Outro' }]} />
        <div className="form-row">
          <Field label="Data"><input className="input" type="date" value={ev.date ?? ''} onChange={(e) => set({ date: e.target.value })} /></Field>
          <Field label="Horário"><input className="input" type="time" value={ev.time ?? ''} onChange={(e) => set({ time: e.target.value || undefined })} /></Field>
        </div>
        <div className="form-row">
          <Field label="Matéria"><SubjectSelect subjects={subjects} value={ev.subjectId} onChange={(subjectId) => set({ subjectId })} allowEmpty /></Field>
          <Field label="Local"><input className="input" value={ev.location ?? ''} onChange={(e) => set({ location: e.target.value })} placeholder="Sala 204 · Bloco B" /></Field>
        </div>
        <Field label="Conteúdos e observações">
          <textarea className="textarea" style={{ minHeight: 80 }} value={ev.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Ciclo cardíaco, débito cardíaco…" />
        </Field>
        <div className="row-between">
          <span className="small">Lembretes</span>
          <Toggle on={ev.remindersEnabled ?? true} onChange={(remindersEnabled) => set({ remindersEnabled })} label="Lembretes" />
        </div>
        {(ev.remindersEnabled ?? true) && (
          <div className="form-row" style={{ alignItems: 'end' }}>
            <div className="field"><span>Avisar</span><DayChips days={ev.reminderDays ?? [3, 1]} onChange={(reminderDays) => set({ reminderDays })} /></div>
            <Field label="Horário do aviso"><input className="input" type="time" value={ev.reminderTime ?? '09:00'} onChange={(e) => set({ reminderTime: e.target.value })} /></Field>
          </div>
        )}
      </div>
    </Modal>
  );
}
