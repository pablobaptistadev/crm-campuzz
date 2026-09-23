import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { carregarMetadata, type ObjetoMeta } from 'src/api/metadata';
import { CLUBES_QUERY, MEMBROS_RESUMO_QUERY, PIPELINE_QUERY } from 'src/api/queries';
import { type ClubeResumo } from 'src/api/types';
import { AlternarVisao, Chip, Pipeline, Vazio, useModoVisao } from 'src/ui/primitives';
import { StatusEditavel } from 'src/ui/StatusEditavel';
import { TRACO, dataCurta, dinheiroCurto } from 'src/ui/format';
import { AvatarDoMembro } from 'src/modules/perfil/ui/AvatarDoMembro';
import { buscarNoPainel } from 'src/ui/busca';
import { type AlunoDoPainel, BuscaGlobal } from 'src/ui/BuscaGlobal';
import { paginar } from 'src/ui/paginar';

type Clube = Omit<ClubeResumo, 'membros' | 'jornada'>;
type MembroResumo = AlunoDoPainel & { situacao: string | null; clubeId: string | null };
type EtapaResumo = { id: string; clubeId: string | null; ordem: number | null; situacao: string | null };

const diasAte = (data: string | null): number | null => {
  if (data === null || data === '') {
    return null;
  }

  const alvo = new Date(`${data.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(alvo.getTime())) {
    return null;
  }

  return Math.round((alvo.getTime() - Date.now()) / 86_400_000);
};

export const Dashboard = () => {
  const [clubes, setClubes] = useState<Clube[] | null>(null);
  const [membros, setMembros] = useState<MembroResumo[]>([]);
  const [pipeline, setPipeline] = useState<EtapaResumo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [modo, setModo] = useModoVisao('clubes', 'lista');
  const [metaClube, setMetaClube] = useState<ObjetoMeta | null>(null);

  const trocarStatus = (clubeId: string) => (situacao: string) =>
    setClubes((atual) =>
      atual === null
        ? atual
        : atual.map((clube) => (clube.id === clubeId ? { ...clube, situacao } : clube)),
    );

  useEffect(() => {
    let cancelado = false;

    const carregar = async () => {
      try {
        const [listaClubes, listaMembros, listaPipeline, metadata] = await Promise.all([
          paginar<Clube>(CLUBES_QUERY, 'clubes'),
          paginar<MembroResumo>(MEMBROS_RESUMO_QUERY, 'membros'),
          paginar<EtapaResumo>(PIPELINE_QUERY, 'etapasJornada'),
          carregarMetadata(),
        ]);

        if (!cancelado) {
          setClubes(listaClubes);
          setMetaClube(metadata.get('clube') ?? null);
          setMembros(listaMembros);
          setPipeline(listaPipeline);
        }
      } catch (causa) {
        if (!cancelado) {
          setErro(causa instanceof Error ? causa.message : 'Não conseguimos carregar os clubes.');
        }
      }
    };

    void carregar();

    return () => {
      cancelado = true;
    };
  }, []);

  const resumo = useMemo(() => {
    const lista = clubes ?? [];

    return {
      total: lista.length,
      ativos: lista.filter((clube) => clube.situacao === 'ATIVO').length,
      capital: lista.reduce(
        (soma, clube) => soma + Number(clube.capitalNegociado?.amountMicros ?? 0) / 1_000_000,
        0,
      ),
      membros: membros.length,
      alertas: lista.filter((clube) => {
        const dias = diasAte(clube.mouValidade);

        return dias !== null && dias < 0;
      }).length,
    };
  }, [clubes, membros]);

  const encontrados = useMemo(
    () => buscarNoPainel(busca, membros, clubes ?? []),
    [busca, membros, clubes],
  );
  const filtrados = encontrados.clubes;
  const buscando = busca.trim() !== '';

  const nomeDoClube = useMemo(
    () => new Map((clubes ?? []).map((clube) => [clube.id, clube.name])),
    [clubes],
  );

  if (erro !== null) {
    return <div className="adm-error">{erro}</div>;
  }

  if (clubes === null || metaClube === null) {
    return <div className="adm-loading">Carregando os clubes…</div>;
  }

  return (
    <>
      <div className="adm-crumbs">Dashboard</div>

      <div className="adm-kpis">
        <div className="adm-kpi">
          <div className="adm-kpi__label">Total clubes</div>
          <div className="adm-kpi__value">{resumo.total}</div>
        </div>
        <div className="adm-kpi">
          <div className="adm-kpi__label">Ativos</div>
          <div className="adm-kpi__value adm-kpi__value--emerald">{resumo.ativos}</div>
        </div>
        <div className="adm-kpi">
          <div className="adm-kpi__label">Capital negociado</div>
          <div className="adm-kpi__value">
            R$ {resumo.capital.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="adm-kpi">
          <div className="adm-kpi__label">Membros</div>
          <div className="adm-kpi__value">{resumo.membros}</div>
        </div>
        <div className="adm-kpi">
          <div className="adm-kpi__label">Alertas</div>
          <div className={resumo.alertas > 0 ? 'adm-kpi__value adm-kpi__value--rose' : 'adm-kpi__value'}>
            {resumo.alertas}
          </div>
        </div>
      </div>

      <div className="adm-toolbar">
        <span className="adm-toolbar__title">{buscando ? 'Busca' : 'Clubes'}</span>
        <span className="adm-toolbar__spacer" />
        <BuscaGlobal
          valor={busca}
          onMudou={setBusca}
          alunos={encontrados.alunos}
          clubes={encontrados.clubes}
        />
        <AlternarVisao modo={modo} onChange={setModo} />
        <Link className="adm-btn adm-btn--primary" to="/clubes/novo">
          + Novo clube
        </Link>
      </div>

      {buscando && (
        <section className="adm-resultados" aria-label="Alunos encontrados">
          <div className="adm-resultados__titulo">
            Alunos <span>{encontrados.alunos.length}</span>
          </div>
          {encontrados.alunos.length === 0 ? (
            <Vazio>Nenhum aluno com “{busca.trim()}” no nome ou no e-mail.</Vazio>
          ) : (
            <div className="adm-alunos">
              {encontrados.alunos.map((aluno) => (
                <Link className="adm-aluno" to={`/membros/${aluno.id}`} key={aluno.id}>
                  <AvatarDoMembro nome={aluno.name ?? ''} fotoUrl={aluno.fotoUrl ?? null} tamanho="card" />
                  <span className="adm-aluno__texto">
                    <span className="adm-aluno__nome">{aluno.name ?? TRACO}</span>
                    <span className="adm-aluno__email">
                      {aluno.emails?.primaryEmail ?? aluno.emailFinanceiro ?? TRACO}
                    </span>
                    <span className="adm-aluno__clube">
                      {aluno.clubeId === null ? 'Sem clube' : (nomeDoClube.get(aluno.clubeId) ?? TRACO)}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {buscando && (
        <div className="adm-resultados__titulo">
          Clubes <span>{filtrados.length}</span>
        </div>
      )}

      {buscando && filtrados.length === 0 ? (
        // Tabela com cabeçalho e corpo vazio, só para dizer que não há nada, é
        // peso na tela no meio de uma busca.
        <Vazio>Nenhum clube com “{busca.trim()}” no nome ou no mentor.</Vazio>
      ) : modo === 'cards' ? (
        filtrados.length === 0 ? (
          <Vazio>Nenhum clube encontrado.</Vazio>
        ) : (
          <div className="adm-colecao">
            {filtrados.map((clube) => {
              const doClube = membros.filter((membro) => membro.clubeId === clube.id);
              const concluidas = pipeline.filter(
                (etapa) =>
                  etapa.clubeId === clube.id &&
                  (etapa.ordem ?? 0) > 100 &&
                  etapa.situacao === 'CONCLUIDA',
              ).length;
              const ativos = doClube.filter((membro) => membro.situacao === 'ATIVO').length;

              return (
                <article className="adm-colecao__card" key={clube.id}>
                  <div className="adm-colecao__topo">
                    <div>
                      <Link className="adm-colecao__nome" to={`/clubes/${clube.id}`}>
                        {clube.name}
                      </Link>
                      <div className="adm-colecao__sub">{clube.mentor ?? TRACO}</div>
                    </div>
                    <StatusEditavel
                      objeto={metaClube}
                      registroId={clube.id}
                      valor={clube.situacao}
                      onSalvo={trocarStatus(clube.id)}
                    />
                  </div>

                  <div className="adm-colecao__linhas">
                    <div className="adm-colecao__linha">
                      <span className="adm-colecao__rotulo">Membros</span>
                      <span>
                        {doClube.length} · {ativos} ativos
                      </span>
                    </div>
                    <div className="adm-colecao__linha">
                      <span className="adm-colecao__rotulo">Capital</span>
                      <span className="adm-table__num">
                        {dinheiroCurto(clube.capitalNegociado)}
                      </span>
                    </div>
                    <div className="adm-colecao__linha">
                      <span className="adm-colecao__rotulo">Início</span>
                      <span className="adm-table__muted">{dataCurta(clube.inicio)}</span>
                    </div>
                    <div className="adm-colecao__linha">
                      <span className="adm-colecao__rotulo">Responsável</span>
                      <span className="adm-table__muted">{clube.responsavel ?? TRACO}</span>
                    </div>
                    <div className="adm-colecao__linha">
                      <span className="adm-colecao__rotulo">Pipeline</span>
                      <Pipeline concluidas={concluidas} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : (
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th style={{ width: 44 }}>#</th>
              <th>Clube / Mentor</th>
              <th>Status</th>
              <th>Início</th>
              <th>Capital</th>
              <th>Financeiro</th>
              <th>MOU</th>
              <th>Membros</th>
              <th>Pipeline</th>
              <th>Resp.</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((clube, indice) => {
              const dias = diasAte(clube.mouValidade);
              const doClube = membros.filter((membro) => membro.clubeId === clube.id);
              const concluidas = pipeline.filter(
                (etapa) =>
                  etapa.clubeId === clube.id &&
                  (etapa.ordem ?? 0) > 100 &&
                  etapa.situacao === 'CONCLUIDA',
              ).length;
              const ativos = doClube.filter((membro) => membro.situacao === 'ATIVO').length;

              return (
                <tr key={clube.id}>
                  <td className="adm-table__muted adm-table__num">{indice + 1}</td>
                  <td>
                    <Link className="adm-table__link" to={`/clubes/${clube.id}`}>
                      {clube.name}
                    </Link>
                    <div className="adm-table__sub">{clube.mentor ?? TRACO}</div>
                  </td>
                  <td>
                    <StatusEditavel
                      objeto={metaClube}
                      registroId={clube.id}
                      valor={clube.situacao}
                      onSalvo={trocarStatus(clube.id)}
                    />
                  </td>
                  <td className="adm-table__muted">{dataCurta(clube.inicio)}</td>
                  <td className="adm-table__num">{dinheiroCurto(clube.capitalNegociado)}</td>
                  <td className="adm-table__muted">{clube.modeloFinanceiro ?? TRACO}</td>
                  <td className="adm-table__num">
                    {dias !== null && dias < 0 ? (
                      <span style={{ color: 'var(--rose)' }}>{dias}d</span>
                    ) : (
                      <span className="adm-table__muted">{TRACO}</span>
                    )}
                  </td>
                  <td>
                    {doClube.length} membros
                    <div className="adm-table__sub">{ativos} ativos</div>
                  </td>
                  <td>
                    <Pipeline concluidas={concluidas} />
                  </td>
                  <td className="adm-table__muted">{clube.responsavel ?? TRACO}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtrados.length === 0 && <Vazio>Nenhum clube encontrado.</Vazio>}
      </div>
      )}
    </>
  );
};
