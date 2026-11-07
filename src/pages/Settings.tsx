import { useEffect, useRef, useState } from 'react';
import { BellRing, Cloud, CloudOff, Download, LogOut, Share, Smartphone, Upload } from 'lucide-react';
import { put, remove, updateSettings, useSettings, useStore } from '../data/store';
import { seedDemo } from '../data/seed';
import { COLLECTIONS, type DB } from '../data/types';
import { supabase } from '../lib/supabase';
import { enablePush, isStandalone, notificationsSupported, notify, pushStatus, type PushResult } from '../lib/notify';
import { formatGrade, parseDecimal } from '../lib/grades';
import { fmt, todayISO } from '../lib/dates';
import { Field, toast } from '../components/ui';
import { ThemeSwitch } from '../components/Layout';

const PUSH_MSG: Record<PushResult, string> = {
  ok: 'Avisos ativados neste aparelho.',
  denied: 'Permissão negada. Libere as notificações nos ajustes do navegador/iPhone.',
  unsupported: 'Este navegador não suporta notificações.',
  'not-installed': 'No iPhone, primeiro instale o app na Tela de Início (veja abaixo) e abra por lá.',
  'no-backend': 'Notificações locais ativadas. Para avisos com o app fechado, configure o push no Supabase (veja o README).',
  error: 'Não foi possível ativar os avisos agora.',
};

export function SettingsPage() {
  const settings = useSettings();
  const { email, userId, sync, lastSyncAt } = useStore();
  const [name, setName] = useState(settings.displayName);
  const [course, setCourse] = useState(settings.course);
  const [intervals, setIntervals] = useState(settings.defaultIntervals.join(', '));
  const [passing, setPassing] = useState(formatGrade(settings.defaultPassing, 1));
  const [push, setPush] = useState<'on' | 'off'>('off');
  const [pwd, setPwd] = useState('');
  const [wipe, setWipe] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

  useEffect(() => { pushStatus().then(setPush); }, []);
  useEffect(() => { setName(settings.displayName); setCourse(settings.course); }, [settings.displayName, settings.course]);

  function saveProfile() {
    const iv = intervals.split(/[,;\s]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    updateSettings({
      displayName: name.trim(),
      course: course.trim() || 'Medicina',
      defaultIntervals: iv.length ? [...new Set(iv)].sort((a, b) => a - b) : settings.defaultIntervals,
      defaultPassing: parseDecimal(passing) ?? settings.defaultPassing,
    });
    toast('Preferências salvas.');
  }

  function exportBackup() {
    const db = useStore.getState().db;
    const blob = new Blob([JSON.stringify({ app: 'mestudos', version: 1, exportedAt: new Date().toISOString(), db }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mestudos-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importBackup(file: File) {
    try {
      const data = JSON.parse(await file.text()) as { app?: string; db?: Partial<DB> };
      if (data.app !== 'mestudos' || !data.db) throw new Error('formato');
      let n = 0;
      for (const c of COLLECTIONS) for (const item of Object.values(data.db[c] ?? {})) { put(c, item as never); n++; }
      toast(`${n} itens importados.`);
    } catch {
      toast('Arquivo de backup inválido.');
    }
  }

  function wipeAll() {
    const db = useStore.getState().db;
    for (const c of COLLECTIONS) for (const item of Object.values(db[c])) if (!item.deleted) remove(c, item.id);
    setWipe(false);
    toast('Todos os dados foram apagados.');
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Preferências e lembretes</h1>
          <p>Ajuste o caderno ao seu jeito de estudar.</p>
        </div>
      </div>

      <div className="grid grid-2 settings-grid">
        <section className="card stack">
          <h2 className="card-title">Você</h2>
          <div className="form-row">
            <Field label="Como quer ser chamada"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mariah" /></Field>
            <Field label="Curso"><input className="input" value={course} onChange={(e) => setCourse(e.target.value)} /></Field>
          </div>
          <div className="form-row">
            <Field label="Revisões padrão (dias)" hint="Usado em temas novos. Ex.: 1, 7, 21"><input className="input" value={intervals} onChange={(e) => setIntervals(e.target.value)} /></Field>
            <Field label="Média mínima padrão" hint="Pode ser ajustada por disciplina."><input className="input" inputMode="decimal" value={passing} onChange={(e) => setPassing(e.target.value)} /></Field>
          </div>
          <div><button className="btn btn-primary btn-sm" onClick={saveProfile}>Salvar preferências</button></div>
        </section>

        <section className="card stack">
          <h2 className="card-title">Aparência</h2>
          <ThemeSwitch />
          <p className="small muted">“Sistema” acompanha o modo claro/escuro do iPhone ou do notebook.</p>
          <hr className="divider" style={{ margin: 0 }} />
          <h2 className="card-title">Conta e sincronização</h2>
          {userId ? (
            <>
              <div className="row small"><Cloud size={16} className="success-text" /> <span className="grow">{email}</span></div>
              <p className="small muted">
                {sync === 'synced' && lastSyncAt ? `Sincronizado às ${fmt(new Date(lastSyncAt), 'HH:mm')}. Tudo aparece no celular e no notebook.` : sync === 'offline' ? 'Sem internet. Suas mudanças ficam salvas e sobem quando a conexão voltar.' : sync === 'error' ? 'Houve um erro ao sincronizar; tentaremos de novo.' : 'Sincronizando…'}
              </p>
              <div className="row wrap">
                <input className="input input-sm" type="password" placeholder="Nova senha" value={pwd} onChange={(e) => setPwd(e.target.value)} style={{ maxWidth: 200 }} autoComplete="new-password" />
                <button className="btn btn-secondary btn-sm" disabled={pwd.length < 6} onClick={async () => { const { error } = await supabase!.auth.updateUser({ password: pwd }); toast(error ? error.message : 'Senha alterada.'); setPwd(''); }}>Alterar senha</button>
                <button className="btn btn-ghost btn-sm" onClick={() => supabase!.auth.signOut()}><LogOut /> Sair</button>
              </div>
            </>
          ) : (
            <div className="row small" style={{ alignItems: 'flex-start' }}>
              <CloudOff size={16} className="warning-text" style={{ flexShrink: 0, marginTop: 2 }} />
              <span className="muted">Modo local: os dados ficam só neste aparelho. Para sincronizar celular e notebook, configure o Supabase (veja o README) e faça login.</span>
            </div>
          )}
        </section>

        <section className="card stack">
          <h2 className="card-title row"><BellRing size={18} /> Avisos</h2>
          <p className="small muted">Lembretes de provas e entregas (nos dias que você escolher em cada evento), o resumo das revisões do dia às 7h e o fim de cada pomodoro.</p>
          <div className="row wrap">
            <button
              className="btn btn-primary btn-sm"
              onClick={async () => {
                const r = await enablePush();
                toast(PUSH_MSG[r]);
                pushStatus().then(setPush);
              }}
            >
              {push === 'on' ? 'Reativar neste aparelho' : 'Ativar avisos neste aparelho'}
            </button>
            {notificationsSupported() && Notification.permission === 'granted' && (
              <button className="btn btn-secondary btn-sm" onClick={() => notify('Tudo certo!', 'É assim que seus lembretes vão aparecer.', 'teste')}>Enviar teste</button>
            )}
          </div>
          <p className="tiny muted">Status: {push === 'on' ? 'push ativo neste aparelho' : notificationsSupported() && Notification.permission === 'granted' ? 'notificações locais permitidas' : 'desativado'}. Ative em cada aparelho (iPhone e notebook).</p>
        </section>

        <section className="card stack">
          <h2 className="card-title row"><Smartphone size={18} /> Instalar no iPhone</h2>
          {isIOS && isStandalone() ? (
            <p className="small success-text">O app já está instalado neste iPhone. ✓</p>
          ) : (
            <ol className="small muted install-steps">
              <li>Abra este endereço no <strong>Safari</strong>.</li>
              <li>Toque em <Share size={14} style={{ verticalAlign: '-2px' }} /> <strong>Compartilhar</strong>.</li>
              <li>Escolha <strong>Adicionar à Tela de Início</strong>.</li>
              <li>Abra o MEstudos pelo ícone e ative os avisos aqui.</li>
            </ol>
          )}
          <p className="tiny muted">No notebook (Chrome/Edge), use o ícone de instalar na barra de endereço.</p>
        </section>

        <section className="card stack">
          <h2 className="card-title">Seus dados</h2>
          <div className="row wrap">
            <button className="btn btn-secondary btn-sm" onClick={exportBackup}><Download /> Exportar backup</button>
            <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}><Upload /> Importar backup</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importBackup(f); e.target.value = ''; }} />
            <button className="btn btn-ghost btn-sm" onClick={() => { seedDemo(); toast('Dados de exemplo adicionados.'); }}>Carregar exemplo</button>
          </div>
          <div>
            {wipe ? (
              <div className="row wrap">
                <span className="small danger-text">Apagar tudo em todos os aparelhos?</span>
                <button className="btn btn-danger btn-sm" onClick={wipeAll}>Sim, apagar</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setWipe(false)}>Cancelar</button>
              </div>
            ) : (
              <button className="btn btn-danger btn-sm" onClick={() => setWipe(true)}>Apagar todos os dados</button>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
