import { useState } from 'react';

import { ApiError, meta } from 'src/api/client';
import { EXCHANGE_MUTATION, LOGIN_MUTATION } from 'src/api/queries';

export const Login = ({ onEntrou }: { onEntrou: () => void }) => {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const entrar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    try {
      const login = await meta<{
        getLoginTokenFromCredentials: { loginToken: { token: string } };
      }>(LOGIN_MUTATION, { email, password: senha });

      await meta(EXCHANGE_MUTATION, {
        loginToken: login.getLoginTokenFromCredentials.loginToken.token,
      });

      onEntrou();
    } catch (causa) {
      setErro(
        causa instanceof ApiError && /credenc|password|senha/i.test(causa.message)
          ? 'E-mail ou senha incorretos.'
          : 'Não conseguimos entrar. Tente de novo em instantes.',
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'var(--bg)',
      }}
    >
      <form
        onSubmit={(evento) => void entrar(evento)}
        style={{
          width: '100%',
          maxWidth: 380,
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          background: 'var(--bg-elev-1)',
          padding: 28,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <span className="adm-banner__glyph">CC</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>CRM Campuzz</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sistema de Parceiros</div>
          </div>
        </div>

        {erro !== null && <div className="adm-error">{erro}</div>}

        <div style={{ marginBottom: 14 }}>
          <div className="adm-fieldlabel">E-mail</div>
          <input
            className="adm-input"
            style={{ width: '100%', minWidth: 0 }}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <div className="adm-fieldlabel">Senha</div>
          <input
            className="adm-input"
            style={{ width: '100%', minWidth: 0 }}
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={(evento) => setSenha(evento.target.value)}
          />
        </div>

        <button
          className="adm-btn adm-btn--primary"
          style={{ width: '100%' }}
          type="submit"
          disabled={enviando}
        >
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
};
