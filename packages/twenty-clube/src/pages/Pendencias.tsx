import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import {
  type ClubeDaLista,
  type EtapaDaLista,
  type MembroDaLista,
  type PendenciaDaLista,
  carregarClubes,
  carregarEtapasComDono,
  carregarMembros,
  carregarPendenciasManuais,
} from 'src/api/listas';
import { MembroComFoto } from 'src/modules/perfil/ui/AvatarDoMembro';
import { hojeLocal } from 'src/ui/datas';
import { FiltrosDePendencia } from 'src/ui/FiltrosDePendencia';
import { TRACO, dataCurta } from 'src/ui/format';
import {
  type FiltroDePendencia,
  type LinhaDePendencia,
  type OrigemDaPendencia,
  ROTULO_DA_ORIGEM,
  filtrarPendencias,
  filtroDaUrl,
  filtroParaUrl,
  montarPendencias,
  resumirPendencias,
} from 'src/ui/pendenciasDoPainel';
import { Chip, Vazio } from 'src/ui/primitives';

type Dados = {
  membros: MembroDaLista[];
  clubes: ClubeDaLista[];
  etapas: EtapaDaLista[];
  manuais: PendenciaDaLista[];
};

// Mil linhas de tabela travam a tela no celular; a lista abre nas primeiras
// e cresce a pedido. Os filtros é que fazem o trabalho de achar.
const PAGINA = 100;

const PrazoDaLinha = ({ linha }: { linha: LinhaDePendencia }) => {
  if (linha.prazo === null) {
    return <span className="adm-table__muted">Sem prazo</span>;
  }

  const atraso = linha.diasDeAtraso ?? 0;

  return (
    <>
      {dataCurta(linha.prazo)}
      {atraso > 0 ? (
        <div className="adm-table__sub" style={{ color: 'var(--rose)' }}>
          {atraso} {atraso === 1 ? 'dia' : 'dias'} em atraso
        </div>
      ) : (
        <div className="adm-table__sub">
          {atraso === 0 ? 'vence hoje' : `em ${-atraso} ${atraso === -1 ? 'dia' : 'dias'}`}
        </div>
      )}
    </>
  );
};

export const Pendencias = () => {
  const [parametros, setParametros] = useSearchParams();
  const filtro = useMemo(() => filtroDaUrl(parametros), [parametros]);
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [quantas, setQuantas] = useState(PAGINA);

  useEffect(() => {
    let ativo = true;

    void (async () => {
      try {
        const [membros, clubes, etapas, manuais] = await Promise.all([
          carregarMembros(),
          carregarClubes(),
          carregarEtapasComDono(),
          carregarPendenciasManuais(),
        ]);

        if (ativo) {
          setDados({ membros, clubes, etapas, manuais });
        }
      } catch (causa) {
        if (ativo) {
          setErro(causa instanceof Error ? causa.message : 'Não conseguimos carregar as pendências.');
        }
      }
    })();

    return () => {
      ativo = false;
    };
  }, []);

  const linhas = useMemo(
    () => (dados === null ? [] : montarPendencias({ hoje: hojeLocal(), ...dados })),
    [dados],
  );

  const mudarFiltro = (proximo: FiltroDePendencia) => {
    setQuantas(PAGINA);
    setParametros(filtroParaUrl(proximo), { replace: true });
  };

  // Os números do topo contam sem origem e prazo, para cada um ser um atalho:
  // clicar em "Vencidas" filtra por vencidas sem zerar os outros cartões.
  const base = useMemo(
    () => filtrarPendencias(linhas, { ...filtro, origem: '', prazo: '' }),
    [linhas, filtro],
  );
  const resumo = useMemo(() => resumirPendencias(base), [base]);
  const visiveis = useMemo(() => filtrarPendencias(linhas, filtro), [linhas, filtro]);

  const opcoes = useMemo(() => {
    const clubes = (dados?.clubes ?? [])
      .map((clube) => ({ id: clube.id, nome: clube.name }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const jornada = linhas.filter((linha) => linha.origem !== 'manual');
    const etapas = [...new Set(jornada.map((linha) => linha.oQue))].sort((a, b) =>
      a.localeCompare(b, 'pt-BR'),
    );
    const responsaveis = [
      ...new Set(jornada.map((linha) => linha.responsavel).filter((nome): nome is string => nome !== null)),
    ].sort((a, b) => a.localeCompare(b, 'pt-BR'));

    return { clubes, etapas, responsaveis };
  }, [dados, linhas]);

  if (erro !== null) {
    return <div className="adm-error">{erro}</div>;
  }

  if (dados === null) {
    return <div className="adm-loading">Carregando as pendências…</div>;
  }

  const kpis: { chave: string; rotulo: string; valor: number; ativo: boolean; aoClicar: () => void; alerta?: boolean }[] = [
    {
      chave: 'total',
      rotulo: 'Pendências',
      valor: resumo.total,
      ativo: filtro.origem === '' && filtro.prazo === '',
      aoClicar: () => mudarFiltro({ ...filtro, origem: '', prazo: '' }),
    },
    {
      chave: 'vencidas',
      rotulo: 'Vencidas',
      valor: resumo.vencidas,
      ativo: filtro.prazo === 'vencidas',
      alerta: resumo.vencidas > 0,
      aoClicar: () => mudarFiltro({ ...filtro, prazo: filtro.prazo === 'vencidas' ? '' : 'vencidas' }),
    },
    ...(Object.keys(ROTULO_DA_ORIGEM) as OrigemDaPendencia[]).map((origem) => ({
      chave: origem,
      rotulo: ROTULO_DA_ORIGEM[origem],
      valor: resumo.porOrigem[origem],
      ativo: filtro.origem === origem,
      aoClicar: () => mudarFiltro({ ...filtro, origem: filtro.origem === origem ? '' : origem }),
    })),
  ];

  return (
    <>
      <div className="adm-crumbs">
        <Link to="/">Dashboard</Link> / Pendências
      </div>

      <div className="adm-record">
        <div>
          <div className="adm-record__name">Pendências</div>
          <div className="adm-record__sub">
            Etapas obrigatórias da jornada ainda não concluídas, de clubes e membros, e as
            pendências anotadas à mão
          </div>
        </div>
      </div>

      <div className="adm-kpis">
        {kpis.map((kpi) => (
          <button
            key={kpi.chave}
            type="button"
            className={kpi.ativo ? 'adm-kpi adm-kpi--on' : 'adm-kpi'}
            onClick={kpi.aoClicar}
          >
            <div className="adm-kpi__label">{kpi.rotulo}</div>
            <div className={kpi.alerta ? 'adm-kpi__value adm-kpi__value--rose' : 'adm-kpi__value'}>
              {kpi.valor}
            </div>
          </button>
        ))}
      </div>

      <div className="adm-toolbar" style={{ flexWrap: 'wrap', gap: 10 }}>
        <FiltrosDePendencia
          valor={filtro}
          onMudou={mudarFiltro}
          clubes={opcoes.clubes}
          etapas={opcoes.etapas}
          responsaveis={opcoes.responsaveis}
        />
      </div>

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Quem</th>
              <th>Pendência</th>
              <th>Clube</th>
              <th>Prazo</th>
              <th>Responsável</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.slice(0, quantas).map((linha) => (
              <tr key={linha.chave}>
                <td>
                  <Link className="adm-table__link" to={linha.link}>
                    {linha.dono.tipo === 'membro' ? (
                      <MembroComFoto nome={linha.dono.nome} fotoUrl={linha.dono.fotoUrl} />
                    ) : (
                      linha.dono.nome
                    )}
                  </Link>
                  {linha.inativo && <div className="adm-table__sub">Inativo</div>}
                </td>
                <td>
                  {linha.oQue}
                  {linha.opcional && (
                    <span className="adm-chip adm-chip--slate" style={{ marginLeft: 6 }}>
                      Opcional
                    </span>
                  )}
                  <div className="adm-table__sub">{ROTULO_DA_ORIGEM[linha.origem]}</div>
                </td>
                <td>
                  {linha.clube === null || linha.dono.tipo === 'clube' ? (
                    <span className="adm-table__muted">{linha.dono.tipo === 'clube' ? 'O próprio clube' : TRACO}</span>
                  ) : (
                    <Link className="adm-table__link" to={`/clubes/${linha.clube.id}`}>
                      {linha.clube.nome}
                    </Link>
                  )}
                </td>
                <td>
                  <PrazoDaLinha linha={linha} />
                </td>
                <td className={linha.responsavel === null ? 'adm-table__muted' : ''}>
                  {linha.responsavel ?? TRACO}
                </td>
                <td>{linha.situacao === null ? TRACO : <Chip valor={linha.situacao} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visiveis.length === 0 && (
          <Vazio>
            {linhas.length === 0 ? 'Nenhuma pendência. Tudo em dia por aqui.' : 'Nenhuma pendência com esse filtro.'}
          </Vazio>
        )}
        {visiveis.length > quantas && (
          <div style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
            <button type="button" className="adm-btn" onClick={() => setQuantas((atual) => atual + PAGINA)}>
              Mostrar mais {Math.min(PAGINA, visiveis.length - quantas)}
            </button>
            <span className="adm-table__muted">
              {quantas} de {visiveis.length}
            </span>
          </div>
        )}
      </div>
    </>
  );
};
