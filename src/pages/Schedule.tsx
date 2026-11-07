import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check as CheckIcon, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { patch, put, remove, useList } from '../data/store';
import { useSubjectMap, useSubjects, useTerm, useToday } from '../data/hooks';
import { addDays, diffDays, fmt, minutesToTime, timeToMinutes, todayISO, WEEKDAY_LONG, WEEKDAY_NAME } from '../lib/dates';
import { cx, Empty, Field, Segmented, SubjectSelect, toast } from '../components/ui';
import type { ClassSlot } from '../data/types';

const ROW_H = 26; // px por 30 min
type Apply = 'futuras' | 'todas';

export function SchedulePage() {
  const today = useToday();
  const term = useTerm();
  const subjects = useSubjects();
  const subjectMap = useSubjectMap();
  const allClasses = useList('classes');
  const [editing, setEditing] = useState<Partial<ClassSlot> | null>(null);
  const [mobileDay, setMobileDay] = useState(() => { const wd = new Date().getDay(); return wd === 0 ? 1 : wd; });

  const classes = useMemo(() => allClasses.filter((c) => !c.validUntil || c.validUntil >= today), [allClasses, today]);
  const hasSaturday = classes.some((c) => c.weekday === 6);
  const days = hasSaturday ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];

  const [startMin, endMin] = useMemo(() => {
    if (!classes.length) return [7 * 60, 19 * 60];
    const s = Math.min(...classes.map((c) => timeToMinutes(c.start)));
    const e = Math.max(...classes.map((c) => timeToMinutes(c.end)));
    return [Math.min(7 * 60, Math.floor(s / 60) * 60), Math.max(18 * 60, Math.ceil(e / 60) * 60)];
  }, [classes]);
  const rows = (endMin - startMin) / 30;
  const hours = Array.from({ length: (endMin - startMin) / 60 }, (_, i) => startMin + i * 60);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Grade horária</h1>
          <p>Seu semestre em uma semana. A grade pode mudar junto com sua rotina.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ weekday: mobileDay, start: '08:00', end: '10:00' })}>
          <Plus /> <span className="btn-label">Adicionar aula</span>
        </button>
      </div>

      <TermCard key={term?.id ?? 'new'} />

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <div className="row">
            <h2>Semana padrão</h2>
            {term && <span className="badge hide-mobile">Repetir até {fmt(term.end, 'dd MMM')}</span>}
          </div>
          <span className="small muted hide-mobile">Selecione uma aula para editar</span>
        </div>

        {subjects.length === 0 && (
          <div className="banner banner-info" style={{ marginBottom: 16 }}>
            <span className="small grow">Cadastre suas matérias primeiro para montar a grade.</span>
            <Link to="/temas" className="btn btn-secondary btn-sm">Cadastrar matérias</Link>
          </div>
        )}

        <div className="show-mobile" style={{ marginBottom: 12 }}>
          <Segmented<string> value={String(mobileDay)} onChange={(v) => setMobileDay(Number(v))} options={days.map((d) => ({ value: String(d), label: WEEKDAY_NAME[d].slice(0, 3) }))} />
        </div>

        <div className="timetable" style={{ ['--cols' as string]: days.length, ['--rows' as string]: rows, ['--row-h' as string]: `${ROW_H}px` }}>
          <div className="tt-corner tiny faint">HORÁRIO</div>
          {days.map((d) => (
            <div key={d} className={cx('tt-head', d !== mobileDay && 'mobile-hidden')}>{WEEKDAY_NAME[d]}</div>
          ))}
          <div className="tt-times">
            {hours.map((h) => (
              <div key={h} className="tt-time" style={{ top: ((h - startMin) / 30) * ROW_H }}>
                <strong className="small">{minutesToTime(h)}</strong>
              </div>
            ))}
          </div>
          {days.map((d) => (
            <div key={d} className={cx('tt-col', d !== mobileDay && 'mobile-hidden')}>
              {hours.map((h) => (
                <button
                  key={h}
                  className="tt-slot"
                  style={{ top: ((h - startMin) / 30) * ROW_H, height: 2 * ROW_H }}
                  onClick={() => setEditing({ weekday: d, start: minutesToTime(h), end: minutesToTime(Math.min(h + 120, 23 * 60)) })}
                  aria-label={`Adicionar aula ${WEEKDAY_NAME[d]} ${minutesToTime(h)}`}
                >
                  <Plus size={14} />
                </button>
              ))}
              {classes.filter((c) => c.weekday === d).map((c) => {
                const s = subjectMap.get(c.subjectId);
                const top = ((timeToMinutes(c.start) - startMin) / 30) * ROW_H;
                const h = ((timeToMinutes(c.end) - timeToMinutes(c.start)) / 30) * ROW_H;
                return (
                  <button
                    key={c.id}
                    className={cx('tt-class tinted', `c-${s?.color ?? 'sand'}`, editing?.id === c.id && 'sel')}
                    style={{ top: top + 2, height: h - 4 }}
                    onClick={() => setEditing(c)}
                  >
                    <strong>{s?.name ?? 'Matéria removida'}</strong>
                    <span>{[c.kind, c.location].filter(Boolean).join(' · ')}</span>
                    <span className="tt-meta">{c.start}–{c.end}</span>
                    {editing?.id === c.id && <Pencil className="tt-pencil" size={13} />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {classes.length === 0 && subjects.length > 0 && <p className="small muted mt-3">Toque em um horário vazio ou em “Adicionar aula” para começar.</p>}
      </section>

      {editing && <ClassEditor key={editing.id ?? `${editing.weekday}-${editing.start}`} initial={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function TermCard() {
  const term = useTerm();
  const [name, setName] = useState(term?.name ?? '');
  const [start, setStart] = useState(term?.start ?? todayISO());
  const [end, setEnd] = useState(term?.end ?? addDays(todayISO(), 135));
  const dirty = !term || name !== term.name || start !== term.start || end !== term.end;
  const days = diffDays(start, end) + 1;
  const weeks = Math.floor(days / 7);

  return (
    <section className="card term-card">
      <div className="field" style={{ flex: 1.4 }}>
        <input className="term-name serif" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: 4º período de Medicina" aria-label="Nome do período" />
        <span className="tiny muted">{days > 0 ? `${weeks} semanas${days % 7 ? ` e ${days % 7} dias` : ''} · grade recorrente` : 'Datas inválidas'}</span>
      </div>
      <Field label="Início do período"><input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
      <Field label="Término do período"><input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      <div className="stack-sm" style={{ alignItems: 'flex-end', justifyContent: 'flex-end' }}>
        {!dirty && <span className="badge badge-green">Grade atualizada</span>}
        <button
          className={cx('btn btn-sm', dirty ? 'btn-primary' : 'btn-secondary')}
          disabled={!dirty || !name.trim() || days <= 0}
          onClick={() => {
            put('terms', { ...(term ?? {}), name: name.trim(), start, end });
            toast('Período salvo.');
          }}
        >
          <CheckIcon /> Salvar período
        </button>
      </div>
    </section>
  );
}

function ClassEditor({ initial, onClose }: { initial: Partial<ClassSlot>; onClose: () => void }) {
  const today = useToday();
  const subjects = useSubjects();
  const subjectMap = useSubjectMap();
  const term = useTerm();
  const [c, setC] = useState<Partial<ClassSlot>>(initial);
  const [apply, setApply] = useState<Apply>('futuras');
  const set = (p: Partial<ClassSlot>) => setC((x) => ({ ...x, ...p }));
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);
  const isNew = !initial.id;
  const valid = !!c.subjectId && !!c.start && !!c.end && c.start < c.end;
  // só faz sentido preservar o histórico se a aula já aconteceu antes de hoje
  const hasHistory = !isNew && (!!term && term.start < today) && (!initial.validFrom || initial.validFrom < today);

  function save() {
    if (!valid) return;
    if (isNew) {
      put('classes', { ...(c as ClassSlot), validFrom: undefined });
      toast('Aula adicionada.');
    } else if (apply === 'futuras' && hasHistory) {
      patch('classes', initial.id!, { validUntil: addDays(today, -1) });
      const { id: _id, updatedAt: _u, ...rest } = c as ClassSlot;
      void _id; void _u;
      put('classes', { ...rest, validFrom: today, validUntil: undefined });
      toast('Aula atualizada a partir de hoje.');
    } else {
      put('classes', c as ClassSlot);
      toast('Aula atualizada.');
    }
    onClose();
  }

  function del() {
    if (apply === 'futuras' && hasHistory) patch('classes', initial.id!, { validUntil: addDays(today, -1) });
    else remove('classes', initial.id!);
    toast('Aula removida da grade.');
    onClose();
  }

  return (
    <section ref={ref} className="card class-editor" style={{ marginTop: 16 }}>
      <div className="card-head">
        <h2>{isNew ? 'Nova aula' : `Editar aula · ${subjectMap.get(initial.subjectId ?? '')?.name ?? ''}`}</h2>
        <button className="card-link" onClick={onClose}>Cancelar edição</button>
      </div>
      <div className="class-form">
        <Field label="Matéria"><SubjectSelect subjects={subjects} value={c.subjectId} onChange={(subjectId) => set({ subjectId })} /></Field>
        <Field label="Dia">
          <select className="select" value={c.weekday} onChange={(e) => set({ weekday: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5, 6].map((d) => <option key={d} value={d}>{WEEKDAY_LONG[d]}</option>)}
          </select>
        </Field>
        <Field label="Início"><input className="input" type="time" value={c.start ?? ''} onChange={(e) => set({ start: e.target.value })} /></Field>
        <Field label="Fim"><input className="input" type="time" value={c.end ?? ''} onChange={(e) => set({ end: e.target.value })} /></Field>
        <Field label="Local">
          <div style={{ position: 'relative' }}>
            <input className="input" value={c.location ?? ''} onChange={(e) => set({ location: e.target.value })} placeholder="Sala 204" style={{ paddingRight: 34 }} />
            <MapPin size={15} className="faint" style={{ position: 'absolute', right: 12, top: 12 }} />
          </div>
        </Field>
        <Field label="Tipo"><input className="input" value={c.kind ?? ''} onChange={(e) => set({ kind: e.target.value })} placeholder="Teórica, Prática, Tutoria…" list="class-kinds" /></Field>
        <datalist id="class-kinds">
          {['Teórica', 'Prática', 'Laboratório', 'Tutoria', 'Simulação', 'Ambulatório'].map((k) => <option key={k} value={k} />)}
        </datalist>
        {hasHistory && (
          <Field label="Aplicar mudança">
            <select className="select" value={apply} onChange={(e) => setApply(e.target.value as Apply)}>
              <option value="futuras">Todas as próximas aulas</option>
              <option value="todas">Todas, inclusive as que já aconteceram</option>
            </select>
          </Field>
        )}
      </div>
      {c.start && c.end && c.start >= c.end && <p className="small danger-text mt-2">O fim precisa ser depois do início.</p>}
      <div className="row-between mt-4 wrap">
        <span className="hint">As aulas já realizadas ficam no histórico. Você pode alterar horários e matérias a qualquer momento.</span>
        <div className="row">
          {!isNew && <button className="btn btn-danger btn-sm" onClick={del}><Trash2 /> Remover</button>}
          <button className="btn btn-primary" disabled={!valid} onClick={save}><CheckIcon /> Salvar aula</button>
        </div>
      </div>
      {subjects.length === 0 && <Empty title="Sem matérias"><Link to="/temas">Cadastre uma matéria</Link></Empty>}
    </section>
  );
}
