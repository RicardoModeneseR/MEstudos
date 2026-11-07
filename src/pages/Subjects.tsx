import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Bold, BookOpen, Check as CheckIcon, ChevronLeft, ChevronRight, Circle, CircleCheck, CircleDot, Ellipsis, ExternalLink, FileText, Italic,
  Link2, List, Pencil, Plus, Search, Trash2, Upload,
} from 'lucide-react';
import { patch, put, remove, useList, useSettings, useStore } from '../data/store';
import { useSubjects, useToday } from '../data/hooks';
import { countdown, fmt, formatMinutes } from '../lib/dates';
import { completeNext, intervalsPatch, nextPendingReview, statusPatch } from '../lib/reviews';
import { Markdown } from '../lib/markdown';
import { supabase } from '../lib/supabase';
import { uid } from '../lib/ids';
import { cx, Empty, Field, Modal, Progress, Segmented, toast, Toggle } from '../components/ui';
import { StudyWithChatGPT } from '../components/ChatGPT';
import type { Material, Subject, SubjectColor, Topic, TopicStatus } from '../data/types';

const STATUS_LABEL: Record<TopicStatus, string> = { nao_vi: 'não vi', estudei: 'estudei', revisado: 'revisado' };
const STATUS_BADGE: Record<TopicStatus, string> = { nao_vi: 'badge', estudei: 'badge badge-plum', revisado: 'badge badge-green' };
const COLORS: SubjectColor[] = ['plum', 'sage', 'sand', 'sky', 'amber', 'rose'];
const INTERVAL_OPTIONS = [1, 2, 3, 4, 5, 7, 10, 14, 15, 21, 30, 45, 60, 90, 120];

export function SubjectsPage() {
  const [params, setParams] = useSearchParams();
  const subjects = useSubjects();
  const topics = useList('topics');
  const [modal, setModal] = useState<'subject' | 'topic' | null>(null);
  const [editSubject, setEditSubject] = useState<Subject | null>(null);

  const topicParam = params.get('tema');
  const selTopic = topics.find((t) => t.id === topicParam);
  const subjectId = selTopic?.subjectId ?? params.get('materia') ?? subjects[0]?.id;
  const subject = subjects.find((s) => s.id === subjectId);

  const counts = useMemo(() => {
    const c = { nao_vi: 0, estudei: 0, revisado: 0 };
    topics.forEach((t) => c[t.status]++);
    return c;
  }, [topics]);
  const studied = counts.estudei + counts.revisado;

  const go = (p: { materia?: string; tema?: string }) => {
    const next = new URLSearchParams();
    if (p.materia) next.set('materia', p.materia);
    if (p.tema) next.set('tema', p.tema);
    setParams(next);
  };

  // no celular a navegação é em camadas: matérias → temas → tema
  const mobileLevel = topicParam ? 'topic' : params.get('materia') ? 'topics' : 'subjects';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Matérias e temas</h1>
          <p>Seu conhecimento, organizado para crescer. {topics.length} temas em {subjects.length} matérias.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal(subjects.length ? 'topic' : 'subject')} >
          <Plus /> <span className="btn-label">{subjects.length ? 'Novo tema' : 'Nova matéria'}</span>
        </button>
      </div>

      {topics.length > 0 && (
        <div className="row-between wrap" style={{ marginBottom: 16 }}>
          <div className="row">
            <span className="badge">{counts.nao_vi} · não vi</span>
            <span className="badge badge-plum">{counts.estudei} · estudei</span>
            <span className="badge badge-green">{counts.revisado} · revisado</span>
          </div>
          <span className="small muted">{studied} de {topics.length} temas já estudados · {((studied / topics.length) * 100).toFixed(1).replace('.0', '').replace('.', ',')}%</span>
        </div>
      )}

      {subjects.length === 0 ? (
        <div className="card">
          <Empty icon={<BookOpen />} title="Nenhuma matéria ainda">
            <p className="small" style={{ marginBottom: 16 }}>Cadastre as matérias do período e depois os temas de cada uma.</p>
            <button className="btn btn-primary" onClick={() => setModal('subject')}><Plus /> Nova matéria</button>
          </Empty>
        </div>
      ) : (
        <div className={cx('subjects-layout', `level-${mobileLevel}`)}>
          <div className="subject-list">
            {subjects.map((s) => {
              const ts = topics.filter((t) => t.subjectId === s.id);
              const done = ts.filter((t) => t.status !== 'nao_vi').length;
              return (
                <button key={s.id} className={cx('card subject-card', s.id === subjectId && 'sel')} onClick={() => go({ materia: s.id })}>
                  <span className="row-between">
                    <strong>{s.name}</strong>
                    <ChevronRight size={16} className="show-tablet faint" />
                  </span>
                  <span className="tiny muted">{done} de {ts.length} temas estudados</span>
                  <Progress value={ts.length ? done / ts.length : 0} thin />
                </button>
              );
            })}
            <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setModal('subject')}><Plus /> Nova matéria</button>
          </div>

          {subject && (
            <TopicList
              subject={subject}
              topics={topics.filter((t) => t.subjectId === subject.id)}
              selectedId={selTopic?.id}
              onSelect={(id) => go({ materia: subject.id, tema: id })}
              onBack={() => go({})}
              onNew={() => setModal('topic')}
              onEditSubject={() => setEditSubject(subject)}
            />
          )}

          {selTopic ? (
            <TopicDetail key={selTopic.id} topic={selTopic} subject={subject} onBack={() => go({ materia: subject?.id })} />
          ) : (
            <div className="card topic-detail hide-tablet">
              <Empty icon={<FileText />} title="Escolha um tema">
                <p className="small">Veja o resumo, os materiais e as revisões de cada tema.</p>
              </Empty>
            </div>
          )}
        </div>
      )}

      {modal === 'subject' && <SubjectModal onClose={() => setModal(null)} onSaved={(id) => go({ materia: id })} />}
      {editSubject && <SubjectModal subject={editSubject} onClose={() => setEditSubject(null)} onSaved={() => undefined} />}
      {modal === 'topic' && <TopicModal defaultSubject={subject?.id} onClose={() => setModal(null)} onSaved={(t) => go({ materia: t.subjectId, tema: t.id })} />}
    </>
  );
}

function TopicList({ subject, topics, selectedId, onSelect, onBack, onNew, onEditSubject }: {
  subject: Subject; topics: Topic[]; selectedId?: string; onSelect: (id: string) => void; onBack: () => void; onNew: () => void; onEditSubject: () => void;
}) {
  const today = useToday();
  const [filter, setFilter] = useState<'todos' | TopicStatus>('todos');
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const list = topics
    .filter((t) => filter === 'todos' || t.status === filter)
    .filter((t) => !q || norm(t.name).includes(norm(q)) || norm(t.group ?? '').includes(norm(q)))
    .sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '') || a.order - b.order || a.name.localeCompare(b.name));
  const visible = showAll || q ? list : list.slice(0, 12);

  return (
    <section className="card topic-list">
      <button className="add-link show-tablet" onClick={onBack} style={{ marginBottom: 8 }}><ChevronLeft /> Matérias</button>
      <div className="card-head">
        <h2>{subject.name}</h2>
        <button className="icon-btn" aria-label="Editar matéria" onClick={onEditSubject}><Ellipsis /></button>
      </div>
      <div className="search-box">
        <input className="input" placeholder={`Buscar em ${topics.length} temas`} value={q} onChange={(e) => setQ(e.target.value)} />
        <Search size={16} className="faint" />
      </div>
      <Segmented<'todos' | TopicStatus>
        className="mt-3"
        value={filter}
        onChange={setFilter}
        options={[{ value: 'todos', label: 'Todos' }, { value: 'nao_vi', label: 'não vi' }, { value: 'estudei', label: 'estudei' }, { value: 'revisado', label: 'revisado' }]}
      />
      <div className="stack-sm mt-3">
        {visible.length === 0 && <p className="small muted" style={{ padding: '12px 0' }}>{topics.length ? 'Nenhum tema com esse filtro.' : 'Nenhum tema nesta matéria ainda.'}</p>}
        {visible.map((t) => (
          <button key={t.id} className={cx('topic-row', t.id === selectedId && 'sel')} onClick={() => onSelect(t.id)}>
            <span className="row-between">
              <span style={{ fontWeight: 500 }}>{t.name}</span>
              <ChevronRight size={15} className="faint" />
            </span>
            <span className="row-between">
              <span className={STATUS_BADGE[t.status]}>{STATUS_LABEL[t.status]}</span>
              <span className="tiny faint">{topicMeta(t, today)}</span>
            </span>
          </button>
        ))}
      </div>
      {!showAll && !q && list.length > 12 && <button className="card-link mt-3" onClick={() => setShowAll(true)}>Ver todos os {list.length} temas →</button>}
      <button className="add-link mt-3" onClick={onNew}><Plus /> Novo tema</button>
    </section>
  );
}

function topicMeta(t: Topic, today: string): string {
  const next = nextPendingReview(t);
  if (next) {
    if (next.due < today) return `Revisão atrasada · ${fmt(next.due, 'dd MMM')}`;
    if (next.due === today) return 'Revisão hoje';
    return `Próxima revisão · ${fmt(next.due, 'dd MMM')}`;
  }
  const last = [...t.reviews].reverse().find((r) => r.doneAt);
  if (last?.doneAt) return `Última revisão · ${fmt(last.doneAt, 'dd MMM')}`;
  if (t.studiedAt) return `Estudado · ${fmt(t.studiedAt, 'dd MMM')}`;
  return 'Sem data definida';
}

function TopicDetail({ topic, subject, onBack }: { topic: Topic; subject?: Subject; onBack: () => void }) {
  const today = useToday();
  const sessions = useList('sessions');
  const [editing, setEditing] = useState(false);
  const minutes = sessions.filter((s) => s.topicId === topic.id).reduce((s, x) => s + x.minutes, 0);

  function setStatus(status: TopicStatus) {
    if (status === topic.status) return;
    patch('topics', topic.id, statusPatch(topic, status, today));
    if (status === 'estudei' && topic.spacedEnabled && !topic.studiedAt) toast('Revisões agendadas.');
  }

  return (
    <section className="card topic-detail">
      <button className="add-link show-tablet" onClick={onBack} style={{ marginBottom: 8 }}><ChevronLeft /> {subject?.name}</button>
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <div className="tiny faint" style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>{[subject?.name, topic.group].filter(Boolean).join(' / ')}</div>
          <h2 style={{ fontSize: 28, marginTop: 4 }}>{topic.name}</h2>
          <p className="small muted mt-1">
            {topic.studiedAt ? `Estudado em ${fmt(topic.studiedAt, 'dd MMM')}` : 'Ainda não estudado'}
            {minutes > 0 && ` · ${formatMinutes(minutes)} acumuladas`}
          </p>
        </div>
        <button className="icon-btn" aria-label="Editar tema" onClick={() => setEditing(true)}><Pencil /></button>
      </div>
      <Segmented<TopicStatus>
        className="mt-3"
        value={topic.status}
        onChange={setStatus}
        options={[{ value: 'nao_vi', label: 'não vi' }, { value: 'estudei', label: 'estudei' }, { value: 'revisado', label: 'revisado' }]}
      />
      <hr className="divider" />
      <SummaryEditor topic={topic} />
      <Materials topic={topic} />
      <hr className="divider" />
      <StudyWithChatGPT topic={topic} subject={subject} />
      <hr className="divider" />
      <SpacedReview topic={topic} />
      {editing && <TopicModal topic={topic} onClose={() => setEditing(false)} onSaved={() => undefined} />}
    </section>
  );
}

function SummaryEditor({ topic }: { topic: Topic }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(topic.summary);
  const ref = useRef<HTMLTextAreaElement>(null);

  const save = () => {
    if (text !== topic.summary) patch('topics', topic.id, { summary: text, summarySavedAt: new Date().toISOString() });
    setEditing(false);
  };

  const wrap = (before: string, after = before, placeholder = 'texto') => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = text.slice(s, e) || placeholder;
    const next = text.slice(0, s) + before + sel + after + text.slice(e);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + sel.length);
    });
  };
  const bullet = () => {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart;
    const lineStart = text.lastIndexOf('\n', s - 1) + 1;
    setText(text.slice(0, lineStart) + '- ' + text.slice(lineStart));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + 2, s + 2); });
  };

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 10 }}>
        <h3 style={{ fontSize: 18 }}>Meu resumo</h3>
        {editing ? (
          <div className="row" style={{ gap: 0 }}>
            <button className="icon-btn" title="Negrito" onMouseDown={(e) => e.preventDefault()} onClick={() => wrap('**')}><Bold /></button>
            <button className="icon-btn" title="Itálico" onMouseDown={(e) => e.preventDefault()} onClick={() => wrap('*')}><Italic /></button>
            <button className="icon-btn" title="Lista" onMouseDown={(e) => e.preventDefault()} onClick={bullet}><List /></button>
            <button className="icon-btn" title="Link" onMouseDown={(e) => e.preventDefault()} onClick={() => wrap('[', '](https://)', 'texto do link')}><Link2 /></button>
          </div>
        ) : (
          <button className="icon-btn" aria-label="Editar resumo" onClick={() => setEditing(true)}><Pencil /></button>
        )}
      </div>
      {editing ? (
        <>
          <textarea
            ref={ref}
            autoFocus
            className="textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'### Título\nEscreva com suas palavras.\n\n- tópicos com hífen\n- **negrito** e *itálico*'}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); } }}
            style={{ minHeight: 220 }}
          />
          <div className="row mt-2" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setText(topic.summary); setEditing(false); }}>Cancelar</button>
            <button className="btn btn-primary btn-sm" onClick={save}><CheckIcon /> Salvar resumo</button>
          </div>
        </>
      ) : topic.summary ? (
        <div onDoubleClick={() => setEditing(true)}>
          <Markdown text={topic.summary} />
          {topic.summarySavedAt && <p className="tiny success-text mt-2">✓ Resumo salvo · {fmt(new Date(topic.summarySavedAt), "dd MMM, HH:mm")}</p>}
        </div>
      ) : (
        <button className="summary-empty" onClick={() => setEditing(true)}>Escreva seu resumo deste tema…</button>
      )}
    </div>
  );
}

function Materials({ topic }: { topic: Topic }) {
  const userId = useStore((s) => s.userId);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const today = useToday();

  const add = (m: Omit<Material, 'id' | 'addedAt'>) => patch('topics', topic.id, { materials: [...topic.materials, { ...m, id: uid(), addedAt: today }] });

  async function open(m: Material) {
    if (m.url) return window.open(m.url, '_blank', 'noopener');
    if (m.storagePath && supabase) {
      const win = window.open('', '_blank');
      const { data, error } = await supabase.storage.from('materials').createSignedUrl(m.storagePath, 3600);
      if (error || !data) { win?.close(); return toast('Não foi possível abrir o arquivo.'); }
      if (win) win.location.href = data.signedUrl; else window.location.href = data.signedUrl;
    }
  }

  async function upload(file: File) {
    if (!supabase || !userId) return;
    if (file.size > 50 * 1024 * 1024) return toast('Arquivo maior que 50 MB.');
    setUploading(true);
    const safe = file.name.normalize('NFD').replace(/[^\w.-]+/g, '_');
    const path = `${userId}/${topic.id}/${uid()}-${safe}`;
    const { error } = await supabase.storage.from('materials').upload(path, file, { contentType: file.type });
    setUploading(false);
    if (error) return toast('Falha no envio: ' + error.message);
    add({ name: file.name.replace(/\.[^.]+$/, ''), storagePath: path, size: file.size });
    toast('Arquivo adicionado.');
  }

  async function del(m: Material) {
    patch('topics', topic.id, { materials: topic.materials.filter((x) => x.id !== m.id) });
    if (m.storagePath && supabase) await supabase.storage.from('materials').remove([m.storagePath]);
  }

  return (
    <div className="mt-4">
      <div className="stack-sm">
        {topic.materials.map((m) => (
          <div key={m.id} className="material">
            <FileText size={18} className="accent" />
            <button className="grow" onClick={() => open(m)} style={{ textAlign: 'left', background: 'none', border: 0, padding: 0 }}>
              <strong className="small" style={{ display: 'block' }}>{m.name}</strong>
              <span className="tiny muted">
                {m.url ? new URL(m.url).hostname.replace('www.', '') : `PDF · ${((m.size ?? 0) / 1024 / 1024).toFixed(1).replace('.', ',')} MB`} · adicionado em {fmt(m.addedAt, 'dd MMM')}
              </span>
            </button>
            <button className="icon-btn" aria-label="Abrir" onClick={() => open(m)}><ExternalLink /></button>
            <button className="icon-btn" aria-label="Remover" onClick={() => del(m)}><Trash2 /></button>
          </div>
        ))}
      </div>
      {adding ? (
        <div className="material-form mt-2">
          <input className="input input-sm" placeholder="Nome (ex.: Aula 5 · slides)" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input input-sm" placeholder="https://…" type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
          <div className="row">
            <button className="btn btn-primary btn-sm" disabled={!/^https?:\/\/\S+\.\S+/.test(url)} onClick={() => { add({ name: name.trim() || url, url: url.trim() }); setName(''); setUrl(''); setAdding(false); }}>Adicionar link</button>
            {supabase && userId && (
              <>
                <button className="btn btn-secondary btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}><Upload /> {uploading ? 'Enviando…' : 'Enviar arquivo'}</button>
                <input ref={fileRef} type="file" hidden accept=".pdf,image/*,.doc,.docx,.ppt,.pptx" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; setAdding(false); }} />
              </>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="row-between mt-2">
          <button className="add-link" onClick={() => setAdding(true)}><Plus /> Adicionar arquivo ou link</button>
          {topic.materials.length > 0 && <span className="tiny faint">{topic.materials.length} {topic.materials.length === 1 ? 'material' : 'materiais'}</span>}
        </div>
      )}
    </div>
  );
}

function SpacedReview({ topic }: { topic: Topic }) {
  const today = useToday();
  const [intervals, setIntervals] = useState(topic.intervals);
  useEffect(() => {
    setIntervals(topic.intervals);
  }, [topic.intervals]);
  const dirty = intervals.join() !== topic.intervals.join();
  const next = nextPendingReview(topic);

  return (
    <div>
      <div className="row-between">
        <h3 style={{ fontSize: 18 }}>Revisão espaçada</h3>
        <div className="row">
          {topic.spacedEnabled && <span className="badge badge-green">Ativada</span>}
          <Toggle on={topic.spacedEnabled} onChange={(v) => patch('topics', topic.id, { spacedEnabled: v, ...(v && topic.studiedAt ? intervalsPatch({ ...topic, spacedEnabled: true }, topic.intervals) : {}) })} label="Revisão espaçada" />
        </div>
      </div>
      {topic.spacedEnabled && (
        <>
          <p className="small muted mt-2">
            {topic.studiedAt ? `Intervalos em dias após o estudo de ${fmt(topic.studiedAt, 'dd/MM')}. Você escolhe seu ritmo.` : 'As revisões são agendadas quando você marcar o tema como “estudei”.'}
          </p>
          <div className="interval-grid mt-3">
            {intervals.map((n, i) => (
              <Field key={i} label={`${i + 1}ª revisão`}>
                <div className="row" style={{ gap: 4 }}>
                  <select className="select" value={n} onChange={(e) => setIntervals(intervals.map((x, j) => (j === i ? Number(e.target.value) : x)))}>
                    {[...new Set([...INTERVAL_OPTIONS, n])].sort((a, b) => a - b).map((d) => <option key={d} value={d}>{d} {d === 1 ? 'dia' : 'dias'}</option>)}
                  </select>
                  {intervals.length > 1 && <button className="icon-btn" aria-label="Remover revisão" onClick={() => setIntervals(intervals.filter((_, j) => j !== i))}><Trash2 size={14} /></button>}
                </div>
              </Field>
            ))}
            {intervals.length < 6 && (
              <button className="add-link" style={{ alignSelf: 'end', paddingBottom: 12 }} onClick={() => setIntervals([...intervals, Math.max(...intervals, 0) * 2 || 30])}>
                <Plus /> Revisão
              </button>
            )}
          </div>
          {topic.reviews.length > 0 && (
            <div className="review-list mt-3">
              {topic.reviews.map((r, i) => (
                <div key={i} className="row small">
                  {r.doneAt ? <CircleCheck size={16} className="success-text" /> : r === next ? <CircleDot size={16} className="accent" /> : <Circle size={16} className="faint" />}
                  <strong style={{ width: 56 }}>{fmt(r.due, 'dd MMM')}</strong>
                  <span className="muted">
                    {r.doneAt ? `Feita em ${fmt(r.doneAt, 'dd/MM')}` : countdown(today, r.due)} · revisão de {r.intervalDays} {r.intervalDays === 1 ? 'dia' : 'dias'}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="row mt-4 wrap" style={{ justifyContent: 'space-between' }}>
            <span className="tiny accent">{topic.reviews.filter((r) => !r.doneAt).map((r) => fmt(r.due, 'dd MMM')).join(' · ')}</span>
            <div className="row">
              <button className="btn btn-secondary btn-sm" disabled={!dirty} onClick={() => { patch('topics', topic.id, intervalsPatch(topic, intervals)); toast('Intervalos salvos.'); }}>Salvar intervalos</button>
              {next && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    patch('topics', topic.id, { reviews: completeNext(topic.reviews, today), status: 'revisado' });
                    toast('Revisão registrada.');
                  }}
                >
                  <CheckIcon /> Marcar revisado
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SubjectModal({ subject, onClose, onSaved }: { subject?: Subject; onClose: () => void; onSaved: (id: string) => void }) {
  const subjects = useSubjects();
  const topics = useList('topics');
  const [name, setName] = useState(subject?.name ?? '');
  const [color, setColor] = useState<SubjectColor>(subject?.color ?? COLORS[subjects.length % COLORS.length]);
  const [confirm, setConfirm] = useState(false);

  const save = () => {
    if (!name.trim()) return;
    const s = put('subjects', { ...(subject ?? { order: subjects.length }), name: name.trim(), color });
    onSaved(s.id);
    onClose();
  };

  return (
    <Modal
      title={subject ? 'Editar matéria' : 'Nova matéria'}
      onClose={onClose}
      footer={
        <>
          {subject && (
            <button className="btn btn-danger" onClick={() => {
              if (!confirm) return setConfirm(true);
              topics.filter((t) => t.subjectId === subject.id).forEach((t) => remove('topics', t.id));
              remove('subjects', subject.id);
              toast('Matéria excluída.');
              onClose();
            }}>
              <Trash2 /> {confirm ? 'Confirmar exclusão' : 'Excluir'}
            </button>
          )}
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!name.trim()} onClick={save}>Salvar</button>
        </>
      }
    >
      <div className="stack">
        <Field label="Nome"><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="Ex.: Fisiologia" /></Field>
        <div className="field">
          <span>Cor</span>
          <div className="row">
            {COLORS.map((c) => (
              <button key={c} type="button" className={cx('color-pick tinted', `c-${c}`, c === color && 'on')} onClick={() => setColor(c)} aria-label={c}>
                {c === color && <CheckIcon size={14} />}
              </button>
            ))}
          </div>
        </div>
        {confirm && <p className="small danger-text">Isso também remove os {topics.filter((t) => t.subjectId === subject?.id).length} temas desta matéria.</p>}
      </div>
    </Modal>
  );
}

function TopicModal({ topic, defaultSubject, onClose, onSaved }: { topic?: Topic; defaultSubject?: string; onClose: () => void; onSaved: (t: Topic) => void }) {
  const subjects = useSubjects();
  const topics = useList('topics');
  const settings = useSettings();
  const [name, setName] = useState(topic?.name ?? '');
  const [subjectId, setSubjectId] = useState(topic?.subjectId ?? defaultSubject ?? subjects[0]?.id);
  const [group, setGroup] = useState(topic?.group ?? '');
  const [many, setMany] = useState(false);
  const groups = [...new Set(topics.filter((t) => t.subjectId === subjectId && t.group).map((t) => t.group!))];

  const save = () => {
    if (!subjectId) return;
    const names = many ? name.split('\n').map((n) => n.trim()).filter(Boolean) : [name.trim()].filter(Boolean);
    if (!names.length) return;
    let last: Topic | undefined;
    names.forEach((n, i) => {
      last = put('topics', topic
        ? { ...topic, name: n, subjectId, group: group.trim() || undefined }
        : { subjectId, name: n, group: group.trim() || undefined, status: 'nao_vi', summary: '', materials: [], spacedEnabled: true, intervals: settings.defaultIntervals, reviews: [], order: topics.length + i });
    });
    if (names.length > 1) toast(`${names.length} temas adicionados.`);
    onSaved(last!);
    onClose();
  };

  return (
    <Modal
      title={topic ? 'Editar tema' : 'Novo tema'}
      onClose={onClose}
      footer={
        <>
          {topic && <button className="btn btn-danger" onClick={() => { remove('topics', topic.id); toast('Tema excluído.'); onClose(); }}><Trash2 /> Excluir</button>}
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!name.trim() || !subjectId} onClick={save}>Salvar</button>
        </>
      }
    >
      <div className="stack">
        <Field label={many ? 'Temas (um por linha)' : 'Nome do tema'}>
          {many ? (
            <textarea className="textarea" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={'Ciclo cardíaco\nDébito cardíaco\nPressão arterial'} />
          ) : (
            <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="Ex.: Ciclo cardíaco" />
          )}
        </Field>
        {!topic && <button className="add-link" onClick={() => setMany(!many)}>{many ? 'Adicionar só um tema' : 'Adicionar vários de uma vez'}</button>}
        <div className="form-row">
          <Field label="Matéria">
            <select className="select" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Grupo (opcional)">
            <input className="input" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Sistema cardiovascular" list="topic-groups" />
          </Field>
          <datalist id="topic-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
        </div>
      </div>
    </Modal>
  );
}
