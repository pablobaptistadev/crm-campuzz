import {
  CONTRATOS_DOS_MEMBROS_QUERY,
  FATURAS_DOS_CONTRATOS_QUERY,
  PARCELAS_DOS_MEMBROS_QUERY,
} from 'src/api/queries';
import { type ContratosDoRegistro } from 'src/ui/atraso';
import { paginar } from 'src/ui/paginar';

type ParcelaDoMembro = {
  membroId: string | null;
  situacao: string | null;
  vencimento: string | null;
  pagaEm: string | null;
};

type ContratoDoMembro = { id: string; membroId: string | null };

type FaturaDoContrato = {
  contratoId: string | null;
  invoiceStatus: string | null;
  dueAt: string | null;
  paidAt: string | null;
};

export type FinanceiroDoMembro = {
  parcelas: { edges: { node: Omit<ParcelaDoMembro, 'membroId'> }[] };
  contratos: NonNullable<ContratosDoRegistro>;
};

const vazio = (): FinanceiroDoMembro => ({
  parcelas: { edges: [] },
  contratos: { edges: [] },
});

/**
 * Monta, por membro, o mesmo formato que a relação aninhada devolvia.
 *
 * O formato é mantido de propósito: o filtro de situação financeira e o chip
 * de atraso já leem `parcelas.edges[].node` e `contratos.edges[].node.faturas`,
 * e trocar a origem dos dados não deveria obrigar a reescrever quem os lê.
 */
export const agruparFinanceiro = ({
  membroIds,
  parcelas,
  contratos,
  faturas,
}: {
  membroIds: readonly string[];
  parcelas: readonly ParcelaDoMembro[];
  contratos: readonly ContratoDoMembro[];
  faturas: readonly FaturaDoContrato[];
}): Map<string, FinanceiroDoMembro> => {
  const porMembro = new Map<string, FinanceiroDoMembro>(
    membroIds.map((id) => [id, vazio()]),
  );

  for (const { membroId, ...parcela } of parcelas) {
    if (membroId !== null) {
      porMembro.get(membroId)?.parcelas.edges.push({ node: parcela });
    }
  }

  const faturasPorContrato = new Map<string, FaturaDoContrato[]>();

  for (const fatura of faturas) {
    if (fatura.contratoId !== null) {
      const lista = faturasPorContrato.get(fatura.contratoId) ?? [];

      lista.push(fatura);
      faturasPorContrato.set(fatura.contratoId, lista);
    }
  }

  for (const contrato of contratos) {
    if (contrato.membroId === null) {
      continue;
    }

    porMembro.get(contrato.membroId)?.contratos.edges.push({
      node: {
        faturas: {
          edges: (faturasPorContrato.get(contrato.id) ?? []).map(
            ({ invoiceStatus, dueAt, paidAt }) => ({ node: { invoiceStatus, dueAt, paidAt } }),
          ),
        },
      },
    });
  }

  return porMembro;
};

// Três listas achatadas em vez de duas relações por membro. As duas primeiras
// só dependem dos membros e vão juntas; as faturas esperam os contratos.
export const carregarFinanceiroDosMembros = async (
  membroIds: readonly string[],
): Promise<Map<string, FinanceiroDoMembro>> => {
  if (membroIds.length === 0) {
    return new Map();
  }

  const ids = [...membroIds];
  const [parcelas, contratos] = await Promise.all([
    paginar<ParcelaDoMembro>(PARCELAS_DOS_MEMBROS_QUERY, 'parcelas', { ids }),
    paginar<ContratoDoMembro>(CONTRATOS_DOS_MEMBROS_QUERY, 'gatewayContracts', { ids }),
  ]);

  const faturas =
    contratos.length === 0
      ? []
      : await paginar<FaturaDoContrato>(FATURAS_DOS_CONTRATOS_QUERY, 'gatewayInvoices', {
          ids: contratos.map((contrato) => contrato.id),
        });

  return agruparFinanceiro({ membroIds: ids, parcelas, contratos, faturas });
};
