import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flag, GraduationCap, Plus, Trash2 } from 'lucide-react';
import { put, remove, updateSettings, useList, useSettings } from '../data/store';
import { useSubjects } from '../data/hooks';
import { formatGrade, parseDecimal, summarizeGrades, type GradeSummary } from '../lib/grades';
import { uid } from '../lib/ids';
import { cx, Empty, Field, Progress, toast } from '../components/ui';
import type { Assessment, GradeMethod, Subject } from '../data/types';

type Draft = Assessment & { isNew?: boolean };

const STATUS_TEXT: Record<GradeSummary['status'], string> = {
  sem_avaliacoes: 'Sem avaliações',
  em_andamento: 'Em andamento',
  garantida: 'Aprovação garantida',
  impossivel: 'Média inalcançável',
  aprovada: 'Aprovada',
  reprovada: 'Abaixo da média',
};

function remainingNames(rows: Assessment[]) {
  const pend = rows.filter((a) => a.grade === null).map((a) => a.name);
  if (pend.length === 0) return '';
  if (pend.length === 1) return pend[0];
  return 'cada avaliação restante';
}

export function GradesPage() {
  const subjects = useSubjects();
  const assessments = useList('assessments');
  const settings = useSettings();
  const [selectedId, setSelectedId] = useState<string | undefined>();

  const selected = subjects.find((s) => s.id === selectedId) ?? subjects.find((s) => assessments.some((a) => a.subjectId === s.id)) ?? subjects[0];
  const cfg = (s: Subject) => settings.passing[s.id] ?? { min: settings.defaultPassing, method: 'ponderada' as GradeMethod };

  if (subjects.length === 0) {
    return (
      <>
        <div className="page-head"><div><h1>Notas, com clareza</h1><p>Veja sua média e o que ainda precisa conquistar. Escala de 0 a 10.</p></div></div>
        <div className="card"><Empty icon={<GraduationCap />} title="Nenhuma disciplina"><p className="small">Cadastre suas matérias em <Link to="/temas">Matérias e temas</Link> para lançar as notas.</p></Empty></div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Notas, com clareza</h1>
          <p>Veja sua média e o que ainda precisa conquistar. Escala de 0 a 10.</p>
        </div>
      </div>

      <div className="grade-cards">
        {subjects.map((s) => {
          const list = assessments.filter((a) => a.subjectId === s.id);
          const c = cfg(s);
          const sum = summarizeGrades(list, c.min, c.method);
          const isSel = s.id === selected?.id;
          return (
            <button key={s.id} className={cx('card grade-card', isSel && 'sel')} onClick={() => setSelectedId(s.id)}>
              <span className="row-between">
                <strong>{s.name}</strong>
                <span className={cx('badge', isSel ? 'badge-plum' : sum.status === 'aprovada' || sum.status === 'garantida' ? 'badge-green' : sum.status === 'impossivel' || sum.status === 'reprovada' ? 'badge-red' : '')}>
                  {isSel ? 'Selecionada' : STATUS_TEXT[sum.status]}
                </span>
              </span>
              <span className="row" style={{ alignItems: 'baseline', marginTop: 10 }}>
                <span className="serif" style={{ fontSize: 30 }}>{formatGrade(sum.finalAverage ?? sum.partialAverage)}</span>
                <span className="tiny muted">{sum.finalAverage !== null ? 'média final' : `média parcial · ${sum.totalWeight ? Math.round((sum.evaluatedWeight / sum.totalWeight) * 100) : 0}% avaliado`}</span>
              </span>
              <span className="tiny muted">
                {sum.status === 'em_andamento' && `Precisa de ${formatGrade(sum.needed)} na${list.filter((a) => a.grade === null).length > 1 ? 's' : ''} avaliaç${list.filter((a) => a.grade === null).length > 1 ? 'ões restantes' : 'ão restante'}.`}
                {sum.status === 'garantida' && 'Já passou, mesmo com zero no que falta.'}
                {sum.status === 'impossivel' && `Seria preciso ${formatGrade(sum.needed)}: converse com o professor.`}
                {sum.status === 'aprovada' && `Aprovada com ${formatGrade(sum.finalAverage)}.`}
                {sum.status === 'reprovada' && `Faltaram ${formatGrade(c.min - (sum.finalAverage ?? 0))} pontos.`}
                {sum.status === 'sem_avaliacoes' && 'Adicione as avaliações e pesos.'}
              </span>
            </button>
          );
        })}
      </div>

      {selected && <SubjectGrades key={selected.id} subject={selected} />}
    </>
  );
}

function SubjectGrades({ subject }: { subject: Subject }) {
  const settings = useSettings();
  const all = useList('assessments');
  const saved = useMemo(() => all.filter((a) => a.subjectId === subject.id).sort((a, b) => a.order - b.order), [all, subject.id]);
  const cfg = settings.passing[subject.id] ?? { min: settings.defaultPassing, method: 'ponderada' as GradeMethod };

  const [rows, setRows] = useState<Draft[]>(saved);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [min, setMin] = useState(formatGrade(cfg.min, 1));
  const [method, setMethod] = useState<GradeMethod>(cfg.method);
  const [text, setText] = useState<Record<string, { w: string; g: string }>>({});

  // quando chegam dados de outro aparelho e não há edição pendente, atualiza o rascunho
  const dirtyRows = JSON.stringify(rows.map(strip)) !== JSON.stringify(saved.map(strip)) || deleted.length > 0;
  const minNum = parseDecimal(min) ?? cfg.min;
  const dirty = dirtyRows || minNum !== cfg.min || method !== cfg.method;
  useEffect(() => {
    if (!dirtyRows) setRows(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  const sum = summarizeGrades(rows, minNum, method);
  const w = (a: Assessment) => (method === 'aritmetica' ? 1 : a.weight);
  const pendingCount = rows.filter((a) => a.grade === null).length;

  const setRow = (id: string, p: Partial<Draft>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const field = (r: Draft, k: 'w' | 'g') => text[r.id]?.[k] ?? (k === 'w' ? String(r.weight).replace('.', ',') : r.grade === null ? '' : String(r.grade).replace('.', ','));
  const setField = (r: Draft, k: 'w' | 'g', v: string) => {
    setText((t) => ({ ...t, [r.id]: { w: field(r, 'w'), g: field(r, 'g'), [k]: v } }));
    const n = parseDecimal(v);
    if (k === 'w') setRow(r.id, { weight: n !== null && n >= 0 ? n : 0 });
    else setRow(r.id, { grade: n === null ? null : Math.max(0, Math.min(10, n)) });
  };

  function save() {
    const bad = rows.find((r) => !r.name.trim());
    if (bad) return toast('Dê um nome para cada avaliação.');
    rows.forEach((r, i) => {
      const { isNew: _n, ...rest } = r;
      void _n;
      const orig = saved.find((s) => s.id === r.id);
      if (!orig || JSON.stringify(strip(orig)) !== JSON.stringify(strip({ ...rest, order: i }))) put('assessments', { ...rest, order: i });
    });
    deleted.forEach((id) => remove('assessments', id));
    setDeleted([]);
    setText({});
    if (minNum !== cfg.min || method !== cfg.method) updateSettings({ passing: { ...settings.passing, [subject.id]: { min: minNum, method } } });
    toast('Notas e pesos salvos.');
  }

  const addRow = () => setRows((rs) => [...rs, { id: uid(), updatedAt: '', subjectId: subject.id, name: `Avaliação ${rs.length + 1}`, weight: 1, grade: null, order: rs.length, isNew: true }]);

  const launched = rows.filter((a) => a.grade !== null);
  const partialFormula = launched.length
    ? `(${launched.map((a) => `${formatGrade(a.grade, 1)} × ${formatGrade(w(a), 0)}`).join(' + ')}) ÷ (${launched.map((a) => formatGrade(w(a), 0)).join(' + ')}) = ${formatGrade(sum.weightedSum, 1)} ÷ ${formatGrade(sum.evaluatedWeight, 0)} = ${formatGrade(sum.partialAverage)}`
    : 'Nenhuma nota lançada ainda.';
  const neededFormula = sum.remainingWeight > 0 && sum.totalWeight > 0
    ? `(${formatGrade(minNum, 1)} × ${formatGrade(sum.totalWeight, 0)} − ${formatGrade(sum.weightedSum, 1)}) ÷ ${formatGrade(sum.remainingWeight, 0)} = ${formatGrade(minNum * sum.totalWeight - sum.weightedSum, 1)} ÷ ${formatGrade(sum.remainingWeight, 0)} = ${formatGrade((minNum * sum.totalWeight - sum.weightedSum) / sum.remainingWeight)}`
    : 'Todas as avaliações já foram lançadas.';

  return (
    <>
      <div className="grid grid-main-side" style={{ marginTop: 16 }}>
        <section className="card">
          <div className="card-head"><h2>{subject.name} · avaliações</h2></div>
          <div className="form-row" style={{ gridTemplateColumns: 'minmax(120px, 1fr) minmax(160px, 2fr)', alignItems: 'end' }}>
            <Field label="Média mínima para passar"><input className="input" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} /></Field>
            <Field label="Método de cálculo">
              <select className="select" value={method} onChange={(e) => setMethod(e.target.value as GradeMethod)}>
                <option value="ponderada">Média ponderada</option>
                <option value="aritmetica">Média aritmética (pesos iguais)</option>
              </select>
            </Field>
          </div>
          <p className="tiny muted mt-1" style={{ textAlign: 'right' }}>Peso total: {formatGrade(sum.totalWeight, 0)}</p>

          <div className="grades-table mt-3">
            <div className="gt-head tiny faint">
              <span>AVALIAÇÃO</span><span>PESO</span><span>NOTA</span><span className="hide-mobile">PONTOS NA FINAL</span><span className="hide-mobile">SITUAÇÃO</span><span />
            </div>
            {rows.map((r) => (
              <div key={r.id} className="gt-row">
                <div className="gt-name">
                  <input className="input input-sm ghost-input" value={r.name} onChange={(e) => setRow(r.id, { name: e.target.value })} aria-label="Nome da avaliação" />
                  <input className="input input-sm ghost-input tiny" type="date" value={r.date ?? ''} onChange={(e) => setRow(r.id, { date: e.target.value || undefined })} aria-label="Data" />
                </div>
                <input className="input input-sm gt-num" inputMode="decimal" value={method === 'aritmetica' ? '1' : field(r, 'w')} disabled={method === 'aritmetica'} onChange={(e) => setField(r, 'w', e.target.value)} aria-label="Peso" />
                <input className="input input-sm gt-num" inputMode="decimal" placeholder="—" value={field(r, 'g')} onChange={(e) => setField(r, 'g', e.target.value)} aria-label="Nota" />
                <span className="small hide-mobile">{r.grade !== null && sum.totalWeight ? formatGrade((r.grade * w(r)) / sum.totalWeight) : '—'}</span>
                <span className="hide-mobile"><span className={cx('badge', r.grade !== null ? 'badge-green' : 'badge-amber')}>{r.grade !== null ? 'Lançada' : 'Pendente'}</span></span>
                <button className="icon-btn" aria-label="Remover avaliação" onClick={() => { setRows(rows.filter((x) => x.id !== r.id)); if (!r.isNew) setDeleted([...deleted, r.id]); }}><Trash2 size={15} /></button>
              </div>
            ))}
            {rows.length === 0 && <p className="small muted" style={{ padding: '16px 0' }}>Adicione as avaliações da disciplina com seus pesos.</p>}
          </div>

          <div className="row-between mt-3 small wrap">
            <span className="muted">Peso avaliado: {formatGrade(sum.evaluatedWeight, 0)} de {formatGrade(sum.totalWeight, 0)}</span>
            <strong className="accent">{formatGrade(sum.pointsEarned)} pontos já conquistados</strong>
          </div>
          <div className="row-between mt-4">
            <button className="btn btn-secondary btn-sm" onClick={addRow}><Plus /> Nova avaliação</button>
            <button className="btn btn-primary btn-sm" disabled={!dirty} onClick={save}>Salvar notas e pesos</button>
          </div>
        </section>

        <div className="stack">
          <section className="card">
            <h2 className="card-title">Sua média até aqui</h2>
            <div className="serif accent" style={{ fontSize: 46, lineHeight: 1.2, margin: '8px 0' }}>{formatGrade(sum.finalAverage ?? sum.partialAverage)}</div>
            <p className="small muted">
              {sum.finalAverage !== null
                ? 'Média final com todas as avaliações lançadas.'
                : launched.length
                  ? `Média parcial das avaliações lançadas.${pendingCount ? ` ${pendingCount === 1 ? `A ${rows.find((a) => a.grade === null)?.name} ainda não entra` : 'As pendentes ainda não entram'} nesta média.` : ''}`
                  : 'Lance a primeira nota para ver sua média.'}
            </p>
            <div className="mt-3"><Progress value={sum.totalWeight ? sum.evaluatedWeight / sum.totalWeight : 0} /></div>
            <p className="tiny muted mt-2">{sum.totalWeight ? Math.round((sum.evaluatedWeight / sum.totalWeight) * 100) : 0}% do peso total já avaliado</p>
          </section>

          <section className={cx('card pass-card', (sum.status === 'impossivel' || sum.status === 'reprovada') && 'bad')}>
            <div className="row small"><Flag size={16} /> Para passar em {subject.name}</div>
            {sum.status === 'em_andamento' && (
              <>
                <div className="serif pass-big">{formatGrade(sum.needed)} {pendingCount === 1 ? `na ${remainingNames(rows)}` : <span style={{ fontSize: 18 }}>em {remainingNames(rows)}</span>}</div>
                <p className="small">Com peso {formatGrade(sum.remainingWeight, 0)}, essa nota leva sua média final exatamente a {formatGrade(minNum)}.</p>
                <p className="tiny" style={{ opacity: 0.75, marginTop: 8 }}>Faltam {formatGrade(sum.missingPoints)} pontos na média final.</p>
              </>
            )}
            {sum.status === 'garantida' && <><div className="serif pass-big">Garantida</div><p className="small">Mesmo tirando zero no que falta, sua média fica acima de {formatGrade(minNum)}.</p></>}
            {sum.status === 'impossivel' && <><div className="serif pass-big">{formatGrade(sum.needed)}</div><p className="small">A nota necessária passa de 10. Vale conversar sobre recuperação ou trabalhos extras.</p></>}
            {sum.status === 'aprovada' && <><div className="serif pass-big">Aprovada</div><p className="small">Média final {formatGrade(sum.finalAverage)}. Parabéns!</p></>}
            {sum.status === 'reprovada' && <><div className="serif pass-big">{formatGrade(sum.finalAverage)}</div><p className="small">Abaixo da média mínima de {formatGrade(minNum)}.</p></>}
            {sum.status === 'sem_avaliacoes' && <><div className="serif pass-big">—</div><p className="small">Adicione as avaliações e os pesos para calcular.</p></>}
          </section>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <section className="card">
          <h2 className="card-title">Como calculamos sua média</h2>
          <p className="small accent mt-2" style={{ fontWeight: 500 }}>Média parcial = Σ(nota × peso) ÷ Σ(pesos lançados)</p>
          <p className="small muted mt-1 formula">{partialFormula}</p>
          <p className="tiny muted mt-2">Na média final, a soma será dividida pelo peso total: {formatGrade(sum.totalWeight, 0)}.</p>
        </section>
        <section className="card">
          <h2 className="card-title">Quanto falta para passar</h2>
          <p className="small accent mt-2" style={{ fontWeight: 500 }}>Nota necessária = (mínima × peso total − soma ponderada) ÷ peso restante</p>
          <p className="small muted mt-1 formula">{neededFormula}</p>
          <p className="tiny muted mt-2">Notas vazias são pendentes, não zero. {pendingCount > 1 ? 'Com várias pendentes, mostramos a nota uniforme necessária em cada uma.' : ''}</p>
        </section>
      </div>
      {dirty && <p className="tiny warning-text mt-3">Alterações ainda não salvas.</p>}
      {saved.length === 0 && rows.length === 0 && <p className="tiny muted mt-3">Dica: datas das avaliações não entram na agenda automaticamente; cadastre a prova em Agenda para receber lembretes.</p>}
    </>
  );
}

function strip(a: Assessment & { isNew?: boolean }) {
  return { id: a.id, name: a.name, date: a.date ?? null, weight: a.weight, grade: a.grade, order: a.order };
}

