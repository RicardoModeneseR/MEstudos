import { Component, type ReactNode } from 'react';

/** Mostra o erro em vez de uma tela em branco. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Erro na interface', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="login">
        <div className="card login-card stack">
          <h1 className="serif" style={{ fontSize: 24 }}>Algo deu errado.</h1>
          <p className="small muted">Seus dados estão salvos. Tente recarregar; se continuar, envie a mensagem abaixo.</p>
          <pre className="small" style={{ whiteSpace: 'pre-wrap', background: 'var(--surface-2)', padding: 12, borderRadius: 10, margin: 0, maxHeight: 240, overflow: 'auto' }}>
            {this.state.error.message}
            {'\n'}
            {this.state.error.stack?.split('\n').slice(1, 6).join('\n')}
          </pre>
          <button className="btn btn-primary" onClick={() => location.reload()}>Recarregar</button>
        </div>
      </div>
    );
  }
}
