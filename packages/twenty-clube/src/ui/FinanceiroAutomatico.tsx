import { useEffect, useState } from 'react';

import { gql } from 'src/api/client';
import { AdicionarContrato } from 'src/ui/AdicionarContrato';
import {
  type Cobranca,
  type Marcacao,
  cobrancaDaMarcacao,
  situacaoDeCobranca,
} from 'src/ui/atraso';
import { dataCurta, dinheiroCurto } from 'src/ui/format';
import { Card, Chip, Secao, Vazio } from 'src/ui/primitives';

type Moeda = { amountMicros: number | null; currencyCode: string | null } | null;

export type ParcelaManual = {
  situacao: string | null;
  vencimento: string | null;
  pagaEm: string | null;
};

type Fatura = {
  id: string;
  name: string | null;
  invoiceStatus: string | null;
  amount: Moeda;
  dueAt: string | null;
  paidAt: string | null;
};

type Contrato = {
  id: string;
  name: string | null;
  contractStatus: string | null;
  totalValue: Moeda;
  faturas: { edges: { node: Fatura }[] };
};

const CONTRATOS = `
  query($id: UUID!) {
    gatewayContracts(filter: { __CAMPO__: { eq: $id } }, first: 100) {
      totalCount
      edges { node {
        id name contractStatus
        totalValue { amountMicros currencyCode }
        faturas {
          edges { node {
            id name invoiceStatus dueAt paidAt
            amount { amountMicros currencyCode }
          } }
        }
      } }
    }
  }
`;

export const FinanceiroAutomatico = ({
  dono,
  donoId,
  parcelasManuais,
  marcacao,
}: {
  dono: 'clube' | 'membro';
  donoId: string;
  parcelasManuais: ParcelaManual[];
  marcacao?: Marcacao;
}) => {
  const [contratos, setContratos] = useState<Contrato[] | null>(null);
  const [adicionando, setAdicionando] = useState(false);

  const carregar = async () => {
      try {
        const dados = await gql<{
          gatewayContracts: { edges: { node: Contrato }[] };
        }>(CONTRATOS.replace('__CAMPO__', dono === 'clube' ? 'clubeId' : 'membroId'), {
          id: donoId,
        });

        setContratos(dados.gatewayContracts.edges.map((aresta) => aresta.node));
      } catch {
        // Um workspace sem a migração não tem o objeto. Aqui isso é "nenhum
        // contrato", não uma tela quebrada.
        setContratos([]);
      }
  };

  useEffect(() => {
    void carregar();
  }, [dono, donoId]);

  const faturas = (contratos ?? []).flatMap((contrato) =>
    contrato.faturas.edges.map((aresta) => aresta.node),
  );

  const cobrancas: Cobranca[] = [
    ...cobrancaDaMarcacao(marcacao),
    ...parcelasManuais.map((parcela) => ({
      origem: 'manual' as const,
      situacao: parcela.situacao,
      vence: parcela.vencimento,
      pagaEm: parcela.pagaEm,
    })),
    ...faturas.map((fatura) => ({
      origem: 'automatico' as const,
      situacao: fatura.invoiceStatus,
      vence: fatura.dueAt,
      pagaEm: fatura.paidAt,
    })),
  ];

  const situacao = situacaoDeCobranca(cobrancas);

  const ondeEstaOAtraso = situacao.origensEmAtraso
    .map((origem) => {
      switch (origem) {
        case 'manual':
          return `${situacao.atrasadasPorOrigem.manual} no financeiro manual`;
        case 'automatico':
          return `${situacao.atrasadasPorOrigem.automatico} no automático`;
        case 'marcacao':
          return 'a marcação de inadimplência feita pela equipe';
      }
    })
    .join(' e ');
  // A marcação não é cobrança: contá-la no "olhamos as N cobranças" inflaria
  // o número que a pessoa confere com o financeiro.
  const quantasCobrancas = cobrancas.filter((cobranca) => cobranca.origem !== 'marcacao').length;

  return (
    <>
      <Card titulo="Situação de cobrança">
        <div className="adm-toolbar">
          <Chip valor={situacao.emAtraso ? 'ATRASADA' : 'PAGA'} />
          <span className="adm-toolbar__title">
            {situacao.emAtraso ? 'Em atraso' : 'Em dia'}
          </span>
        </div>

        <p className="adm-painel__ajuda">
          {situacao.emAtraso
            ? `Contamos ${ondeEstaOAtraso}. Basta um lado em atraso para o cliente estar em atraso.`
            : `Olhamos as ${quantasCobrancas} cobranças dos dois financeiros — o lançado à mão e o puxado do gateway. Nenhuma vencida em aberto.`}
        </p>
      </Card>

      {adicionando && (
        <AdicionarContrato
          dono={dono}
          donoId={donoId}
          onFechar={() => setAdicionando(false)}
          onVinculado={() => {
            setAdicionando(false);
            void carregar();
          }}
        />
      )}

      <Card
        titulo="Financeiro automático"
        acao={
          <button
            type="button"
            className="adm-btn adm-btn--primary"
            onClick={() => setAdicionando(true)}
          >
            + Adicionar contrato
          </button>
        }
      >
        {contratos === null ? (
          <Vazio>Carregando…</Vazio>
        ) : contratos.length === 0 ? (
          <Vazio>
            Nenhum contrato vinculado ainda. Use “+ Adicionar contrato” e informe o número do contrato.
          </Vazio>
        ) : (
          contratos.map((contrato) => (
            <div key={contrato.id}>
              <div className="adm-toolbar">
                <span className="adm-toolbar__title">
                  {contrato.name ?? 'Contrato'}
                </span>
                <span className="adm-toolbar__spacer" />
                <span className="adm-table__muted">
                  {dinheiroCurto(contrato.totalValue)}
                </span>
              </div>

              {contrato.faturas.edges.length === 0 ? (
                <Vazio>Sem faturas.</Vazio>
              ) : (
                <>
                  <Secao>Faturas</Secao>
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>Fatura</th>
                        <th>Valor</th>
                        <th>Vencimento</th>
                        <th>Situação</th>
                        <th>Paga em</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contrato.faturas.edges.map(({ node: fatura }) => (
                        <tr key={fatura.id}>
                          <td>{fatura.name ?? '—'}</td>
                          <td className="adm-table__num">
                            {dinheiroCurto(fatura.amount)}
                          </td>
                          <td className="adm-table__muted">
                            {dataCurta(fatura.dueAt)}
                          </td>
                          {/* Sem StatusEditavel de propósito: quem manda na
                              situação é o gateway, e uma edição aqui seria
                              desfeita na próxima sincronização. */}
                          <td>
                            <Chip valor={fatura.invoiceStatus} />
                          </td>
                          <td className="adm-table__muted">
                            {dataCurta(fatura.paidAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          ))
        )}
      </Card>
    </>
  );
};
