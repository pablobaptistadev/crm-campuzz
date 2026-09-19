import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { gql } from 'src/api/client';
import { carregarMetadata, type ObjetoMeta } from 'src/api/metadata';
import {
  ATUALIZAR_PARCELA,
  CLUBES_SIMPLES_QUERY,
  FINANCEIRO_QUERY,
  MEMBROS_SIMPLES_QUERY,
} from 'src/api/queries';
import { NovaVenda } from 'src/ui/NovaVenda';
import { Chip, Vazio } from 'src/ui/primitives';
import { StatusEditavel } from 'src/ui/StatusEditavel';
import { MembroComFoto } from 'src/modules/perfil/ui/AvatarDoMembro';
import { paginar } from 'src/ui/paginar';
import { TRACO, dataCurta, dinheiroCurto } from 'src/ui/format';

type Parcela = {
  id: string;
  name: string;
  numero: number | null;
  situacao: string | null;
  vencimento: string | null;
  pagaEm: string | null;
  lembreteEm: string | null;
  valor: { amountMicros: number | null; currencyCode: string | null } | null;
  formaPagamento: string | null;
  membroId: string | null;
  clubeId: string | null;
};

type Referencia = {
  id: string;
  name: string;
  situacao?: string | null;
  fotoUrl?: string | null;
  emails?: { primaryEmail: string | null } | null;
};

type Faixa = 'atrasados' | 'hoje' | 'sete' | 'trinta' | 'todos';

const FAIXAS: { id: Faixa; rotulo: string }[] = [
  { id: 'atrasados', rotulo: 'Atrasados' },
  { id: 'hoje', rotulo: 'Vencem hoje' },
  { id: 'sete', rotulo: 'Próximos 7 dias' },
  { id: 'trinta', rotulo: 'Próximos 30 dias' },
  { id: 'todos', rotulo: 'Todos' },
];

// Comparar em dias, não em milissegundos: uma parcela que vence hoje às 00:00
// não está atrasada porque já são 09:00.
const diasAte = (vencimento: string | null): number | null => {
  if (vencimento === null || vencimento === '') {
    return null;
  }

  const alvo = new Date(`${vencimento.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(alvo.getTime())) {
    return null;
  }

  const hoje = new Date();

  hoje.setHours(0, 0, 0, 0);

  return Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
};

const emAberto = (parcela: Parcela) =>
  parcela.situacao !== 'PAGA' && parcela.situacao !== 'CANCELADA';

// A varredura de lembrete só tem o e-mail do membro para usar: o clube não tem
// campo de e-mail nenhum. Sem membro, ou com membro sem e-mail, ela marca a
// parcela como avisada e não envia nada — então o aviso tem de aparecer aqui,
// antes da data, enquanto ainda dá para cadastrar o endereço.
const semDestinatario = (parcela: Parcela, membros: Map<string, Referencia>): boolean => {
  if (!emAberto(parcela) || parcela.lembreteEm === null) {
    return false;
  }

  const membro = parcela.membroId === null ? undefined : membros.get(parcela.membroId);

  return (membro?.emails?.primaryEmail ?? '') === '';
};

const naFaixa = (parcela: Parcela, faixa: Faixa): boolean => {
  if (faixa === 'todos') {
    return true;
  }

  if (!emAberto(parcela)) {
    return false;
  }

  const dias = diasAte(parcela.vencimento);

  if (dias === null) {
    return false;
  }

  switch (faixa) {
    case 'atrasados':
      return dias < 0;
    case 'hoje':
      return dias === 0;
    case 'sete':
      return dias > 0 && dias <= 7;
    case 'trinta':
      return dias > 0 && dias <= 30;
  }
};

export const Financeiro = () => {
  const [parcelas, setParcelas] = useState<Parcela[] | null>(null);
  // O clube e o membro de cada parcela vêm por id: buscá-los aninhados custaria
  // uma consulta por linha da tabela.
  const [clubes, setClubes] = useState<Map<string, Referencia>>(new Map());
  const [membros, setMembros] = useState<Map<string, Referencia>>(new Map());
  const [erro, setErro] = useState<string | null>(null);
  const [faixa, setFaixa] = useState<Faixa>('atrasados');
  const [abrindoVenda, setAbrindoVenda] = useState(false);
  const [metaParcela, setMetaParcela] = useState<ObjetoMeta | null>(null);
  const [metaClube, setMetaClube] = useState<ObjetoMeta | null>(null);

  const carregar = async () => {
    try {
      const [listaParcelas, listaClubes, listaMembros, metadata] = await Promise.all([
        paginar<Parcela>(FINANCEIRO_QUERY, 'parcelas'),
        paginar<Referencia>(CLUBES_SIMPLES_QUERY, 'clubes'),
        paginar<Referencia>(MEMBROS_SIMPLES_QUERY, 'membros'),
        carregarMetadata(),
      ]);

      setParcelas(listaParcelas);
      setMetaParcela(metadata.get('parcela') ?? null);
      setMetaClube(metadata.get('clube') ?? null);
      setClubes(new Map(listaClubes.map((clube) => [clube.id, clube])));
      setMembros(new Map(listaMembros.map((membro) => [membro.id, membro])));
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não conseguimos carregar o financeiro.');
    }
  };

  useEffect(() => {
    void carregar();
  }, []);

  const contagem = useMemo(() => {
    const lista = parcelas ?? [];

    return Object.fromEntries(
      FAIXAS.map((item) => [item.id, lista.filter((parcela) => naFaixa(parcela, item.id)).length]),
    ) as Record<Faixa, number>;
  }, [parcelas]);

  const visiveis = useMemo(
    () =>
      (parcelas ?? [])
        .filter((parcela) => naFaixa(parcela, faixa))
        .sort((a, b) => (a.vencimento ?? '').localeCompare(b.vencimento ?? '')),
    [parcelas, faixa],
  );

  const total = visiveis.reduce(
    (soma, parcela) => soma + Number(parcela.valor?.amountMicros ?? 0) / 1_000_000,
    0,
  );

  const mudas = visiveis.filter((parcela) => semDestinatario(parcela, membros)).length;

  const marcarPaga = async (parcela: Parcela) => {
    const paga = parcela.situacao === 'PAGA';
    const proximo = {
      situacao: paga ? 'PENDENTE' : 'PAGA',
      pagaEm: paga ? null : new Date().toISOString().slice(0, 10),
    };

    setParcelas((atual) =>
      (atual ?? []).map((linha) => (linha.id === parcela.id ? { ...linha, ...proximo } : linha)),
    );

    await gql(ATUALIZAR_PARCELA, { id: parcela.id, data: proximo }).catch(() => void carregar());
  };

  // O StatusEditavel já grava; aqui só acompanha a mudança na tela, senão a
  // mesma troca iria ao banco duas vezes.
  const mudarStatusClube = (clubeId: string, situacao: string) => {
    setClubes((atual) => {
      const proximo = new Map(atual);
      const clube = proximo.get(clubeId);

      if (clube !== undefined) {
        proximo.set(clubeId, { ...clube, situacao });
      }

      return proximo;
    });
  };

  if (erro !== null) {
    return <div className="adm-error">{erro}</div>;
  }

  if (parcelas === null || metaParcela === null || metaClube === null) {
    return <div className="adm-loading">Carregando o financeiro…</div>;
  }

  return (
    <>
      <div className="adm-crumbs">
        <Link to="/">Dashboard</Link> / Financeiro
      </div>

      <div className="adm-record">
        <div>
          <div className="adm-record__name">Controle financeiro</div>
          <div className="adm-record__sub">
            Todas as parcelas de todos os clubes e membros — {parcelas.length} no total
          </div>
        </div>
        <span className="adm-record__spacer" />
        <button
          type="button"
          className="adm-btn adm-btn--primary"
          onClick={() => setAbrindoVenda(true)}
        >
          + Nova venda
        </button>
      </div>

      {abrindoVenda && (
        <NovaVenda
          onFechar={() => setAbrindoVenda(false)}
          onCriada={() => {
            setAbrindoVenda(false);
            void carregar();
          }}
        />
      )}

      <div className="adm-kpis">
        {FAIXAS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === faixa ? 'adm-kpi adm-kpi--on' : 'adm-kpi'}
            onClick={() => setFaixa(item.id)}
          >
            <div className="adm-kpi__label">{item.rotulo}</div>
            <div
              className={
                item.id === 'atrasados' && contagem.atrasados > 0
                  ? 'adm-kpi__value adm-kpi__value--rose'
                  : 'adm-kpi__value'
              }
            >
              {contagem[item.id]}
            </div>
          </button>
        ))}
      </div>

      <div className="adm-toolbar">
        <span className="adm-toolbar__title">
          {visiveis.length} itens · Total: R${' '}
          {total.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
        </span>
        {mudas > 0 && (
          <span className="adm-toolbar__alerta">
            ⚠ {mudas} {mudas === 1 ? 'parcela não vai' : 'parcelas não vão'} gerar lembrete — sem
            e-mail de membro
          </span>
        )}
      </div>

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Parcela</th>
              <th>Membro</th>
              <th>Clube</th>
              <th>Vencimento</th>
              <th>Valor</th>
              <th>Situação</th>
              <th>Status do clube</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((parcela) => {
              const dias = diasAte(parcela.vencimento);
              const atrasada = emAberto(parcela) && dias !== null && dias < 0;
              const clube = parcela.clubeId === null ? undefined : clubes.get(parcela.clubeId);
              const membro = parcela.membroId === null ? undefined : membros.get(parcela.membroId);

              return (
                <tr key={parcela.id}>
                  <td>{parcela.name}</td>
                  <td>
                    {membro === undefined ? (
                      <span className="adm-table__muted">{TRACO}</span>
                    ) : (
                      <Link className="adm-table__link" to={`/membros/${membro.id}`}>
                        <MembroComFoto nome={membro.name} fotoUrl={membro.fotoUrl} />
                      </Link>
                    )}
                    {semDestinatario(parcela, membros) && (
                      <div
                        className="adm-table__sub"
                        title="A varredura diária só consegue enviar para o e-mail do membro."
                        style={{ color: 'var(--gold-deep)' }}
                      >
                        ⚠ sem e-mail — não avisamos
                      </div>
                    )}
                  </td>
                  <td>
                    {clube === undefined ? (
                      <span className="adm-table__muted">{TRACO}</span>
                    ) : (
                      <Link className="adm-table__link" to={`/clubes/${clube.id}`}>
                        {clube.name}
                      </Link>
                    )}
                  </td>
                  <td className={atrasada ? '' : 'adm-table__muted'}>
                    {dataCurta(parcela.vencimento)}
                    {atrasada && (
                      <div className="adm-table__sub" style={{ color: 'var(--rose)' }}>
                        {Math.abs(dias ?? 0)} dias em atraso
                      </div>
                    )}
                  </td>
                  <td className="adm-table__num">{dinheiroCurto(parcela.valor)}</td>
                  <td>
                    {atrasada ? (
                      <Chip valor="ATRASADA" />
                    ) : (
                      <StatusEditavel
                        objeto={metaParcela}
                        registroId={parcela.id}
                        valor={parcela.situacao}
                        onSalvo={(proximo) =>
                          setParcelas((atual) =>
                            (atual ?? []).map((linha) =>
                              linha.id === parcela.id
                                ? { ...linha, situacao: proximo }
                                : linha,
                            ),
                          )
                        }
                      />
                    )}
                  </td>
                  <td>
                    {clube === undefined ? (
                      <span className="adm-table__muted">{TRACO}</span>
                    ) : (
                      <StatusEditavel
                        objeto={metaClube}
                        registroId={clube.id}
                        valor={clube.situacao ?? null}
                        onSalvo={(proximo) => mudarStatusClube(clube.id, proximo)}
                      />
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="adm-btn"
                      style={{ padding: '5px 10px', fontSize: 12.5 }}
                      onClick={() => void marcarPaga(parcela)}
                    >
                      {parcela.situacao === 'PAGA' ? 'Reabrir' : 'Dar baixa'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visiveis.length === 0 && (
          <Vazio>
            {faixa === 'atrasados'
              ? 'Nenhum pagamento atrasado. Tudo em dia por aqui.'
              : 'Nada nesse período.'}
          </Vazio>
        )}
      </div>
    </>
  );
};
