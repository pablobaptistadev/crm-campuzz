import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { gql } from 'src/api/client';
import {
  CLUBES_ARQUIVADOS_QUERY,
  CLUBES_SIMPLES_QUERY,
  MEMBROS_ARQUIVADOS_QUERY,
  RESTAURAR_CLUBE,
  RESTAURAR_MEMBRO,
} from 'src/api/queries';
import { Chip, Tabs, Vazio, rotuloDe } from 'src/ui/primitives';
import { MembroComFoto } from 'src/modules/perfil/ui/AvatarDoMembro';
import { paginar } from 'src/ui/paginar';
import { TRACO, dataHora } from 'src/ui/format';

type ClubeArquivado = {
  id: string;
  name: string;
  mentor: string | null;
  situacao: string | null;
  deletedAt: string | null;
};

type MembroArquivado = {
  id: string;
  name: string;
  papel: string | null;
  situacao: string | null;
  clubeId: string | null;
  fotoUrl: string | null;
  deletedAt: string | null;
};

type Aba = 'clubes' | 'membros';

export const Arquivados = () => {
  const [clubes, setClubes] = useState<ClubeArquivado[] | null>(null);
  const [membros, setMembros] = useState<MembroArquivado[] | null>(null);
  const [nomeDoClube, setNomeDoClube] = useState<Map<string, string>>(new Map());
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('clubes');
  const [restaurando, setRestaurando] = useState<string | null>(null);

  const carregar = async () => {
    try {
      const [listaClubes, listaMembros, ativos] = await Promise.all([
        paginar<ClubeArquivado>(CLUBES_ARQUIVADOS_QUERY, 'clubes'),
        paginar<MembroArquivado>(MEMBROS_ARQUIVADOS_QUERY, 'membros'),
        paginar<{ id: string; name: string }>(CLUBES_SIMPLES_QUERY, 'clubes'),
      ]);

      setClubes(listaClubes);
      setMembros(listaMembros);
      // O clube de um membro arquivado pode estar arquivado junto, então o mapa
      // de nomes soma as duas listas — senão a coluna fica vazia justamente nos
      // casos em que o clube inteiro saiu.
      setNomeDoClube(
        new Map(
          [...ativos, ...listaClubes].map((clube) => [clube.id, clube.name] as const),
        ),
      );
    } catch (causa) {
      setErro(
        causa instanceof Error ? causa.message : 'Não conseguimos carregar os arquivados.',
      );
    }
  };

  useEffect(() => {
    void carregar();
  }, []);

  const restaurar = async (tipo: Aba, id: string) => {
    setRestaurando(id);
    setErro(null);

    try {
      await gql(tipo === 'clubes' ? RESTAURAR_CLUBE : RESTAURAR_MEMBRO, { id });

      if (tipo === 'clubes') {
        setClubes((atual) => (atual ?? []).filter((clube) => clube.id !== id));
      } else {
        setMembros((atual) => (atual ?? []).filter((membro) => membro.id !== id));
      }
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não conseguimos restaurar.');
    } finally {
      setRestaurando(null);
    }
  };

  const abas = useMemo(
    () => [
      { id: 'clubes' as const, rotulo: 'Clubes', contagem: clubes?.length ?? 0 },
      { id: 'membros' as const, rotulo: 'Membros', contagem: membros?.length ?? 0 },
    ],
    [clubes, membros],
  );

  if (erro !== null && clubes === null) {
    return <div className="adm-error">{erro}</div>;
  }

  if (clubes === null || membros === null) {
    return <div className="adm-loading">Carregando os arquivados…</div>;
  }

  const total = clubes.length + membros.length;

  return (
    <>
      <div className="adm-crumbs">
        <Link to="/">Dashboard</Link> / Arquivados
      </div>

      <div className="adm-record">
        <div>
          <div className="adm-record__name">Arquivados</div>
          <div className="adm-record__sub">
            {total === 0
              ? 'Nada foi arquivado até agora'
              : `${total} ${total === 1 ? 'registro' : 'registros'} fora do painel — nada foi apagado do banco`}
          </div>
        </div>
      </div>

      {erro !== null && <div className="adm-error">{erro}</div>}

      <Tabs itens={abas} valor={aba} onChange={setAba} />

      {aba === 'clubes' &&
        (clubes.length === 0 ? (
          <Vazio>Nenhum clube arquivado.</Vazio>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Clube</th>
                  <th>Mentor</th>
                  <th>Situação</th>
                  <th>Arquivado em</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {clubes.map((clube) => (
                  <tr key={clube.id}>
                    <td>{clube.name}</td>
                    <td className={clube.mentor === null ? 'adm-table__muted' : ''}>
                      {clube.mentor ?? TRACO}
                    </td>
                    <td>
                      <Chip valor={clube.situacao} />
                    </td>
                    <td className="adm-table__muted">{dataHora(clube.deletedAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="adm-btn"
                        disabled={restaurando === clube.id}
                        onClick={() => void restaurar('clubes', clube.id)}
                      >
                        {restaurando === clube.id ? 'Restaurando…' : 'Restaurar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {aba === 'membros' &&
        (membros.length === 0 ? (
          <Vazio>Nenhum membro arquivado.</Vazio>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Membro</th>
                  <th>Clube</th>
                  <th>Papel</th>
                  <th>Arquivado em</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {membros.map((membro) => (
                  <tr key={membro.id}>
                    <td>
                      <MembroComFoto nome={membro.name} fotoUrl={membro.fotoUrl} />
                    </td>
                    <td className="adm-table__muted">
                      {membro.clubeId === null
                        ? TRACO
                        : (nomeDoClube.get(membro.clubeId) ?? TRACO)}
                    </td>
                    <td>{rotuloDe(membro.papel)}</td>
                    <td className="adm-table__muted">{dataHora(membro.deletedAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="adm-btn"
                        disabled={restaurando === membro.id}
                        onClick={() => void restaurar('membros', membro.id)}
                      >
                        {restaurando === membro.id ? 'Restaurando…' : 'Restaurar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </>
  );
};
