import { useCallback, useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';

import { ApiError, meta } from 'src/api/client';
import { CURRENT_USER_QUERY, OBJETOS_QUERY, SAIR_MUTATION } from 'src/api/queries';
import { ClubeDetalhe } from 'src/pages/ClubeDetalhe';
import { Dashboard } from 'src/pages/Dashboard';
import { Financeiro } from 'src/pages/Financeiro';
import { NovoClube } from 'src/pages/NovoClube';
import { Radar } from 'src/pages/Radar';
import { Login } from 'src/pages/Login';
import { MembroDetalhe } from 'src/pages/MembroDetalhe';
import { iniciais } from 'src/ui/format';

type Usuario = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  currentWorkspace: { id: string; displayName: string } | null;
};

export const App = () => {
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined);
  const [temClubes, setTemClubes] = useState<boolean | undefined>(undefined);

  const sair = useCallback(async () => {
    await meta(SAIR_MUTATION).catch(() => undefined);
    setUsuario(null);
    setTemClubes(undefined);
  }, []);

  const carregarUsuario = useCallback(async () => {
    try {
      const dados = await meta<{ currentUser: Usuario | null }>(CURRENT_USER_QUERY);

      setUsuario(dados.currentUser);

      if (dados.currentUser !== null) {
        // Uma conta de outro workspace loga sem problema e só quebra na
        // primeira consulta; checar aqui troca o erro cru por uma saída.
        const objetos = await meta<{
          objects: { edges: { node: { nameSingular: string } }[] };
        }>(OBJETOS_QUERY);

        setTemClubes(
          objetos.objects.edges.some((aresta) => aresta.node.nameSingular === 'clube'),
        );
      }
    } catch (causa) {
      // Sem sessão a resposta é um erro, não um usuário nulo, então o catch é
      // que decide mostrar a tela de login.
      setUsuario(causa instanceof ApiError ? null : null);
    }
  }, []);

  useEffect(() => {
    void carregarUsuario();
  }, [carregarUsuario]);

  if (usuario === undefined) {
    return <div className="adm-loading">Carregando…</div>;
  }

  if (usuario === null) {
    return <Login onEntrou={() => void carregarUsuario()} />;
  }

  // O painel não pode montar antes disto: ele consultaria clubes num workspace
  // que talvez não os tenha, e a consulta falharia por trás da tela de aviso.
  if (temClubes === undefined) {
    return <div className="adm-loading">Carregando…</div>;
  }

  const nome = [usuario.firstName, usuario.lastName].filter(Boolean).join(' ') || usuario.email;
  const workspace = usuario.currentWorkspace?.displayName ?? 'CRM Campuzz';
  const cabecalho = (
    <header className="adm-banner">
      <div className="adm-banner__brand">
        <span className="adm-banner__glyph">CC</span>
        <div>
          <div className="adm-banner__name">{workspace}</div>
          <div className="adm-banner__sub">Sistema de Parceiros</div>
        </div>
      </div>
      <nav className="adm-banner__nav">
        <NavLink
          to="/"
          end
          className={({ isActive }) => (isActive ? 'adm-banner__link adm-banner__link--on' : 'adm-banner__link')}
        >
          Dashboard
        </NavLink>
        <NavLink
          to="/financeiro"
          className={({ isActive }) => (isActive ? 'adm-banner__link adm-banner__link--on' : 'adm-banner__link')}
        >
          Financeiro
        </NavLink>
        <NavLink
          to="/radar"
          className={({ isActive }) => (isActive ? 'adm-banner__link adm-banner__link--on' : 'adm-banner__link')}
        >
          Radar de Datas
        </NavLink>
      </nav>

      <div className="adm-banner__right">
        {temClubes === true && <span className="adm-banner__ok">✓ sincronizado</span>}
        <span className="adm-banner__avatar" title={nome}>
          {iniciais(nome)}
        </span>
        <button type="button" className="adm-banner__sair" onClick={() => void sair()}>
          Sair
        </button>
      </div>
    </header>
  );

  if (temClubes === false) {
    return (
      <>
        {cabecalho}
        <main className="adm-shell">
          <div className="adm-card" style={{ maxWidth: 560, margin: '48px auto' }}>
            <div className="adm-card__body">
              <div className="adm-record__name" style={{ marginBottom: 10 }}>
                Este workspace não tem clubes
              </div>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 18px' }}>
                Você entrou como <strong>{usuario.email}</strong>, no workspace{' '}
                <strong>{workspace}</strong>. O Sistema de Parceiros vive num workspace
                próprio — saia e entre com a conta dele.
              </p>
              <button type="button" className="adm-btn adm-btn--primary" onClick={() => void sair()}>
                Sair e trocar de conta
              </button>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      {cabecalho}

      <main className="adm-shell">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/financeiro" element={<Financeiro />} />
          <Route path="/radar" element={<Radar />} />
          <Route path="/clubes/novo" element={<NovoClube />} />
          <Route path="/clubes/:id" element={<ClubeDetalhe />} />
          <Route path="/membros/:id" element={<MembroDetalhe />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
};
