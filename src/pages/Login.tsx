import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { BrandMark, Field } from '../components/ui';

export function LoginPage() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMsg(null);
    const { data, error } =
      mode === 'in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) {
      const text = /Invalid login/i.test(error.message) ? 'E-mail ou senha incorretos.' : /registered/i.test(error.message) ? 'Este e-mail já tem conta. Entre com sua senha.' : error.message;
      setMsg({ kind: 'error', text });
    } else if (mode === 'up' && !data.session) {
      setMsg({ kind: 'info', text: 'Conta criada! Confirme pelo link enviado ao seu e-mail e depois entre aqui.' });
      setMode('in');
    }
  }

  async function reset() {
    if (!supabase || !email) return setMsg({ kind: 'error', text: 'Digite seu e-mail acima primeiro.' });
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
    setMsg(error ? { kind: 'error', text: error.message } : { kind: 'info', text: 'Enviamos um link para redefinir a senha.' });
  }

  return (
    <div className="login">
      <form className="card login-card" onSubmit={submit}>
        <div className="brand" style={{ justifyContent: 'center', marginBottom: 8 }}>
          <BrandMark />
          <span className="brand-name">MEstudos</span>
        </div>
        <h1 className="serif" style={{ fontSize: 26, textAlign: 'center' }}>{mode === 'in' ? 'Bem-vinda de volta.' : 'Seu caderno começa aqui.'}</h1>
        <p className="muted small" style={{ textAlign: 'center', marginBottom: 20 }}>Um pouco de constância, todos os dias.</p>
        <div className="stack">
          <Field label="E-mail">
            <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Senha">
            <input className="input" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {msg && <p className={msg.kind === 'error' ? 'small danger-text' : 'small success-text'}>{msg.text}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Aguarde…' : mode === 'in' ? 'Entrar' : 'Criar conta'}</button>
          <div className="row-between small">
            <button type="button" className="card-link" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null); }}>
              {mode === 'in' ? 'Criar uma conta' : 'Já tenho conta'}
            </button>
            {mode === 'in' && <button type="button" className="card-link" style={{ fontWeight: 500 }} onClick={reset}>Esqueci a senha</button>}
          </div>
        </div>
      </form>
    </div>
  );
}
