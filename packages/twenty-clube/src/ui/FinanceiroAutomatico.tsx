import { useEffect, useState } from 'react';

import { gql } from 'src/api/client';
import { type Cobranca, situacaoDeCobranca } from 'src/ui/atraso';
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
}: {
  dono: 'clube' | 'membro';
  donoId: string;
  parcelasManuais: ParcelaManual[];
}) => {
  const [contratos, setContratos] = useState<Contrato[] | null>(null);

  useEffect(() => {
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

    void carregar();
  }, [dono, donoId]);

  const faturas = (contratos ?? []).flatMap((contrato) =>
    contrato.faturas.edges.map((aresta) => aresta.node),
  );

  const cobrancas: Cobranca[] = [
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
    .map((origem) =>
      origem === 'manual'
        ? `${situacao.atrasadasPorOrigem.manual} no financeiro manual`
        : `${situacao.atrasadasPorOrigem.automatico} no automático`,
    )
    .join(' e ');

  return (
    <>
      <Card titulo="Situação de cobrança">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Chip valor={situacao.emAtraso ? 'ATRASADA' : 'PAGA'} />
          <strong style={{ fontSize: 13 }}>
            {situacao.emAtraso ? 'Em atraso' : 'Em dia'}
          </strong>
        </div>

        <p style={{ fontSize: 12, color: '#475569', margin: '10px 0 0' }}>
          {situacao.emAtraso
            ? `Contamos ${ondeEstaOAtraso}. Basta um dos dois lados em atraso para o cliente estar em atraso.`
            : `Olhamos as ${cobrancas.length} cobranças dos dois financeiros — o lançado à mão e o puxado do gateway. Nenhuma vencida em aberto.`}
        </p>
      </Card>

      <Card titulo="Financeiro automático">
        {contratos === null ? (
          <Vazio>Carregando…</Vazio>
        ) : contratos.length === 0 ? (
          <Vazio>
            Nenhum contrato puxado ainda. Cadastre a chave do gateway na aba Configurações.
          </Vazio>
        ) : (
          contratos.map((contrato) => (
            <div key={contrato.id} style={{ marginBottom: 20 }}>
              <div className="adm-toolbar" style={{ marginBottom: 0 }}>
                <span className="adm-toolbar__title">
                  {contrato.name ?? 'Contrato'}
                </span>
                <span className="adm-toolbar__spacer" />
                <span style={{ fontSize: 11, color: '#64748b' }}>
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
