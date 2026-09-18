import { useEffect, useState } from 'react';

import { gql } from 'src/api/client';
import { dinheiroCurto } from 'src/ui/format';
import { Bus } from 'src/ui/Bus';
import { Card, Vazio } from 'src/ui/primitives';

type Moeda = { amountMicros: number | null; currencyCode: string | null } | null;

type Parcela = { valor: Moeda; situacao: string | null };

type Fatura = {
  id: string;
  invoiceStatus: string | null;
  amount: Moeda;
};

const CONTRATOS = `
  query($id: UUID!) {
    gatewayContracts(filter: { __CAMPO__: { eq: $id } }, first: 100) {
      totalCount
      edges { node {
        id name contractStatus
        totalValue { amountMicros currencyCode }
        faturas {
          edges { node { id invoiceStatus amount { amountMicros currencyCode } } }
        }
      } }
    }
  }
`;

const PAGAS = new Set(['PAGA', 'PAID']);

const somar = (valores: Moeda[]): { amountMicros: number; currencyCode: string } => ({
  amountMicros: valores.reduce(
    (total, valor) => total + (valor?.amountMicros ?? 0),
    0,
  ),
  currencyCode: valores.find((valor) => valor?.currencyCode != null)?.currencyCode ?? 'BRL',
});

// Os dois financeiros convivem porque ainda não se decidiu qual fica. Convivem
// sem se misturar: cada número diz de onde veio, e nenhum dos dois soma no
// outro. Somar daria um total que não existe em lugar nenhum e esconderia
// justamente a divergência que precisa ser olhada para escolher.
export const FinanceiroDuplo = ({
  dono,
  donoId,
  businessUnitId,
  parcelas,
  onLigada,
}: {
  dono: 'clube' | 'membro';
  donoId: string;
  businessUnitId: string | null;
  parcelas: Parcela[];
  onLigada: (businessUnitId: string | null) => void;
}) => {
  const [contratos, setContratos] = useState<{
    total: number;
    faturas: Fatura[];
  } | null>(null);

  useEffect(() => {
    const carregar = async () => {
      try {
        const dados = await gql<{
          gatewayContracts: {
            totalCount: number;
            edges: {
              node: { faturas: { edges: { node: Fatura }[] } };
            }[];
          };
        }>(CONTRATOS.replace('__CAMPO__', dono === 'clube' ? 'clubeId' : 'membroId'), {
          id: donoId,
        });

        setContratos({
          total: dados.gatewayContracts.totalCount,
          faturas: dados.gatewayContracts.edges.flatMap((aresta) =>
            aresta.node.faturas.edges.map((interna) => interna.node),
          ),
        });
      } catch {
        // O objeto pode ainda não existir num workspace que não recebeu a
        // migração. Aqui isso é "nenhum contrato", não uma tela quebrada.
        setContratos({ total: 0, faturas: [] });
      }
    };

    void carregar();
  }, [dono, donoId]);

  const manualTotal = somar(parcelas.map((parcela) => parcela.valor));
  const manualPago = somar(
    parcelas
      .filter((parcela) => PAGAS.has(parcela.situacao ?? ''))
      .map((parcela) => parcela.valor),
  );

  const gatewayTotal = somar((contratos?.faturas ?? []).map((fatura) => fatura.amount));
  const gatewayPago = somar(
    (contratos?.faturas ?? [])
      .filter((fatura) => PAGAS.has(fatura.invoiceStatus ?? ''))
      .map((fatura) => fatura.amount),
  );

  return (
    <>
      <Card titulo="Dois financeiros, lado a lado">
        <p style={{ fontSize: 12, color: '#475569', margin: '0 0 12px' }}>
          O financeiro lançado à mão continua inteiro e editável onde sempre
          esteve, na aba <strong>Acompanhamento</strong>. O financeiro puxado da
          Routerfy é este aqui. Os dois convivem e nada é apagado até vocês
          decidirem qual fica.
        </p>

        <table className="adm-table">
          <thead>
            <tr>
              <th>Origem</th>
              <th>Contratos</th>
              <th>Parcelas</th>
              <th>Total</th>
              <th>Pago</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Lançado à mão</td>
              <td className="adm-table__muted">—</td>
              <td className="adm-table__num">{parcelas.length}</td>
              <td className="adm-table__num">{dinheiroCurto(manualTotal)}</td>
              <td className="adm-table__num">{dinheiroCurto(manualPago)}</td>
            </tr>
            <tr>
              <td>Puxado da Routerfy</td>
              <td className="adm-table__num">
                {contratos === null ? '…' : contratos.total}
              </td>
              <td className="adm-table__num">
                {contratos === null ? '…' : contratos.faturas.length}
              </td>
              <td className="adm-table__num">{dinheiroCurto(gatewayTotal)}</td>
              <td className="adm-table__num">{dinheiroCurto(gatewayPago)}</td>
            </tr>
          </tbody>
        </table>

        {contratos !== null && contratos.total === 0 && (
          <Vazio>
            Nenhum contrato puxado ainda. Cadastre a chave abaixo para começar.
          </Vazio>
        )}
      </Card>

      <Bus
        dono={dono}
        donoId={donoId}
        businessUnitId={businessUnitId}
        onLigada={onLigada}
      />
    </>
  );
};
