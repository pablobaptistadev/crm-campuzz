import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { ApiError, meta } from 'src/api/client';
import { CURRENT_USER_QUERY } from 'src/api/queries';
import { ClubeDetalhe } from 'src/pages/ClubeDetalhe';
import { Dashboard } from 'src/pages/Dashboard';
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

  const carregarUsuario = useCallback(async () => {
    try {
      const dados = await meta<{ currentUser: Usuario | null }>(CURRENT_USER_QUERY);

      setUsuario(dados.currentUser);
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

  const nome = [usuario.firstName, usuario.lastName].filter(Boolean).join(' ') || usuario.email;

  return (
    <>
      <header className="adm-banner">
        <div className="adm-banner__brand">
          <span className="adm-banner__glyph">CC</span>
          <div>
            <div className="adm-banner__name">
              {usuario.currentWorkspace?.displayName ?? 'CRM Campuzz'}
            </div>
            <div className="adm-banner__sub">Sistema de Parceiros</div>
          </div>
        </div>
        <div className="adm-banner__right">
          <span className="adm-banner__ok">✓ sincronizado</span>
          <span className="adm-banner__avatar" title={nome}>
            {iniciais(nome)}
          </span>
        </div>
      </header>

      <main className="adm-shell">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/clubes/:id" element={<ClubeDetalhe />} />
          <Route path="/membros/:id" element={<MembroDetalhe />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
};
