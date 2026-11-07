import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check as CheckIcon, ChartNoAxesCombined, Download, Trash2 } from 'lucide-react';
import { put, remove, useList } from '../data/store';
import { useSubjectMap, useSubjects, useToday } from '../data/hooks';
import { addDays, fmt } from '../lib/dates';
import { byTopic, formatPercent, questionTotals, weeklySeries } from '../lib/stats';
import { LineChart } from '../components/LineChart';
import { cx, Empty, Field, Stat, SubjectSelect, toast } from '../components/ui';

function accBadge(acc: number | null) {
  if (acc === null) return 'badge';
  return acc >= 0.75 ? 'badge badge-green' : acc >= 0.6 ? 'badge badge-amber' : 'badge badge-red';
}

export function QuestionsPage() {
  const today = useToday();
  const logs = useList('questionLogs');
  const topics = useList('topics');
  const subjects = useSubjects();
  const subjectMap = useSubjectMap();
  const [weeks, setWeeks] = useState(4);
  const [tableRange, setTableRange] = useState(7);
  const [tableSubject, setTableSubject] = useState<string | undefined>();
  const [showHistory, setShowHistory] = useState(false);

  const from7 = addDays(today, -6);
  const week = questionTotals(logs, from7, today);
  const series = useMemo(() => weeklySeries(logs, today, weeks), [logs, today, weeks]);
  const withData = series.filter((s) => s.accuracy !== null);
  const evolution = withData.length >= 2 ? (withData[withData.length - 1].accuracy! - withData[0].accuracy!) * 100 : null;
  const tableFrom = tableRange === 0 ? '0000-01-01' : addDays(today, -(tableRange - 1));
  const rows = useMemo(() => byTopic(logs, tableFrom, today).filter((r) => !tableSubject || r.subjectId === tableSubject), [logs, tableFrom, today, tableSubject]);
  const topicName = (id?: string) => topics.find((t) => t.id === id)?.name;

  function exportCSV() {
    const header = ['data', 'materia', 'tema', 'feitas', 'acertos', 'aproveitamento'];
    const lines = [...logs]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((l) => [l.date, subjectMap.get(l.subjectId)?.name ?? '', topicName(l.topicId) ?? '', l.done, l.correct, l.done ? (l.correct / l.done).toFixed(3) : ''].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'));
    const blob = new Blob(['﻿' + [header.join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `questoes-${today}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Questões e desempenho</h1>
          <p>Encontre seus avanços e os temas que merecem mais uma visita.</p>
        </div>
        <button className="btn btn-secondary" onClick={exportCSV} disabled={!logs.length}><Download /> <span className="btn-label">Exportar registro</span></button>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Questões · últimos 7 dias" value={week.done} sub={`${fmt(from7, 'dd')} – ${fmt(today, 'dd MMM yyyy')}`} />
        <Stat label="Acertos" value={week.correct} sub={`${week.done - week.correct} erros para revisar`} />
        <Stat label="Aproveitamento" value={formatPercent(week.accuracy)} sub={`${week.correct} ÷ ${week.done} questões`} />
        <Stat
          label={`Evolução em ${weeks} semanas`}
          value={evolution === null ? '—' : `${evolution >= 0 ? '+' : '−'}${Math.abs(Math.round(evolution))} p.p.`}
          sub={evolution === null ? 'Registre por mais semanas' : `de ${formatPercent(withData[0].accuracy)} para ${formatPercent(withData[withData.length - 1].accuracy)} de acerto`}
        />
      </div>

      <div className="grid grid-main-side" style={{ marginBottom: 16 }}>
        <section className="card">
          <div className="card-head">
            <h2>Seu desempenho ao longo do tempo</h2>
            <select className="select input-sm" style={{ width: 'auto' }} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} aria-label="Período do gráfico">
              <option value={4}>Últimas 4 semanas</option>
              <option value={8}>Últimas 8 semanas</option>
              <option value={12}>Últimas 12 semanas</option>
            </select>
          </div>
          <div className="row-between" style={{ marginBottom: 8 }}>
            <span className="small muted row"><ChartNoAxesCombined size={16} /> Percentual de acertos por período de 7 dias</span>
            {evolution !== null && (
              <span className={cx('badge', evolution > 1 ? 'badge-green' : evolution < -1 ? 'badge-amber' : '')}>
                {evolution > 1 ? 'Em evolução' : evolution < -1 ? 'Pede atenção' : 'Estável'}
              </span>
            )}
          </div>
          {withData.length === 0 ? (
            <Empty title="Sem registros no período"><p className="small">Registre suas questões ao lado para ver a curva.</p></Empty>
          ) : (
            <LineChart
              ariaLabel="Percentual de acertos por semana"
              points={series.map((s) => ({
                label: `${fmt(s.from, 'dd')}–${fmt(s.to, 'dd MMM')}`,
                sub: s.done ? `${s.correct}/${s.done} acertos` : '—',
                value: s.accuracy,
                tooltip: s.done ? `${s.correct} acertos em ${s.done} questões` : 'Nenhuma questão',
              }))}
            />
          )}
        </section>

        <RegisterForm />
      </div>

      <section className="card">
        <div className="card-head wrap">
          <h2>Por tema · {tableRange === 0 ? 'todo o período' : `últimos ${tableRange} dias`}</h2>
          <div className="row">
            <select className="select input-sm" style={{ width: 'auto', minWidth: 100 }} value={tableRange} onChange={(e) => setTableRange(Number(e.target.value))} aria-label="Período da tabela">
              <option value={7}>7 dias</option>
              <option value={30}>30 dias</option>
              <option value={0}>Tudo</option>
            </select>
            <SubjectSelect subjects={subjects} value={tableSubject} onChange={setTableSubject} allowEmpty emptyLabel="Todas as matérias" className="select input-sm" />
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="small muted">Nenhuma questão registrada nesse período.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tema / matéria</th>
                  <th className="num">Feitas</th>
                  <th className="num">Acertos</th>
                  <th>Aproveitamento</th>
                  <th className="hide-mobile">Próximo passo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const acc = r.done ? r.correct / r.done : null;
                  return (
                    <tr key={r.key}>
                      <td>
                        <strong style={{ fontWeight: 500 }}>{topicName(r.topicId) ?? 'Questões gerais'}</strong>
                        <div className="tiny muted">{subjectMap.get(r.subjectId)?.name}</div>
                      </td>
                      <td className="num">{r.done}</td>
                      <td className="num">{r.correct}</td>
                      <td><span className={accBadge(acc)}>{formatPercent(acc)}</span></td>
                      <td className="hide-mobile">
                        {r.topicId ? (
                          <Link to={`/temas?tema=${r.topicId}`} className="card-link" style={{ fontWeight: 500 }}>
                            {acc !== null && acc < 0.6 ? 'Reestudar tema' : 'Revisar erros'} <ArrowRight size={13} />
                          </Link>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="row-between mt-3 wrap">
          <p className="tiny muted">Aproveitamento = acertos ÷ questões feitas × 100. Os totais somam todos os registros do período.</p>
          {logs.length > 0 && <button className="card-link" onClick={() => setShowHistory(!showHistory)}>{showHistory ? 'Ocultar registros' : 'Corrigir registros'}</button>}
        </div>
        {showHistory && (
          <div className="mt-3">
            {[...logs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50).map((l) => (
              <div key={l.id} className="list-row small">
                <span className="muted" style={{ width: 56 }}>{fmt(l.date, 'dd/MM')}</span>
                <span className="grow ellipsis">{topicName(l.topicId) ?? 'Geral'} · {subjectMap.get(l.subjectId)?.name}</span>
                <span className="nowrap">{l.correct}/{l.done}</span>
                <button className="icon-btn" aria-label="Excluir registro" onClick={() => { remove('questionLogs', l.id); toast('Registro excluído.', { label: 'Desfazer', run: () => put('questionLogs', { ...l, deleted: false }) }); }}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function RegisterForm() {
  const today = useToday();
  const subjects = useSubjects();
  const topics = useList('topics');
  const [subjectId, setSubjectId] = useState<string | undefined>();
  const [topicId, setTopicId] = useState<string | undefined>();
  const [done, setDone] = useState('');
  const [correct, setCorrect] = useState('');
  const [date, setDate] = useState(today);
  const sid = subjectId ?? subjects[0]?.id;
  const nDone = Number(done);
  const nCorrect = Number(correct);
  const valid = !!sid && Number.isInteger(nDone) && nDone > 0 && Number.isInteger(nCorrect) && nCorrect >= 0 && nCorrect <= nDone;
  const subjectTopics = topics.filter((t) => t.subjectId === sid).sort((a, b) => a.name.localeCompare(b.name));

  function save() {
    if (!valid) return;
    put('questionLogs', { subjectId: sid!, topicId, date, done: nDone, correct: nCorrect });
    toast(`Registro salvo: ${nCorrect} de ${nDone}.`);
    setDone('');
    setCorrect('');
  }

  return (
    <section className="card">
      <div className="card-head"><h2>Registrar questões</h2></div>
      {subjects.length === 0 ? (
        <p className="small muted">Cadastre matérias em <Link to="/temas">Matérias e temas</Link> para registrar questões.</p>
      ) : (
        <div className="stack">
          <Field label="Matéria">
            <SubjectSelect subjects={subjects} value={sid} onChange={(v) => { setSubjectId(v); setTopicId(undefined); }} />
          </Field>
          <Field label="Tema">
            <select className="select" value={topicId ?? ''} onChange={(e) => setTopicId(e.target.value || undefined)}>
              <option value="">Questões gerais da matéria</option>
              {subjectTopics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Field label="Feitas"><input className="input" inputMode="numeric" value={done} onChange={(e) => setDone(e.target.value.replace(/\D/g, ''))} placeholder="20" /></Field>
            <Field label="Acertos"><input className="input" inputMode="numeric" value={correct} onChange={(e) => setCorrect(e.target.value.replace(/\D/g, ''))} placeholder="16" onKeyDown={(e) => e.key === 'Enter' && save()} /></Field>
          </div>
          <Field label="Data"><input className="input" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
          {nDone > 0 && (
            <div className="row-between small">
              <span className="muted">Prévia · {nCorrect || 0} de {nDone}</span>
              {nCorrect > nDone ? <span className="badge badge-red">Acertos maiores que feitas</span> : <span className={accBadge(nCorrect / nDone)}>{formatPercent(nCorrect / nDone)} de acerto</span>}
            </div>
          )}
          <button className="btn btn-primary" disabled={!valid} onClick={save}><CheckIcon /> Salvar registro</button>
        </div>
      )}
    </section>
  );
}
