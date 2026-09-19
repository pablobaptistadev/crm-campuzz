import { type Cobranca, situacaoDeCobranca } from 'src/ui/atraso';

type Parcela = {
  situacao: string | null;
  vencimento: string | null;
  pagaEm: string | null;
};

type Fatura = {
  invoiceStatus: string | null;
  dueAt: string | null;
  paidAt: string | null;
};

type Contratos = {
  edges: { node: { faturas: { edges: { node: Fatura }[] } } }[];
} | null;

// Só aparece quando há atraso. Um selo permanente de "em dia" vira ruído, e o
// que precisa saltar aos olhos de quem abre a ficha é o contrário disso.
export const ChipDeAtraso = ({
  parcelas,
  contratos,
}: {
  parcelas: Parcela[];
  contratos: Contratos;
}) => {
  const cobrancas: Cobranca[] = [
    ...parcelas.map((parcela) => ({
      origem: 'manual' as const,
      situacao: parcela.situacao,
      vence: parcela.vencimento,
      pagaEm: parcela.pagaEm,
    })),
    ...(contratos?.edges ?? []).flatMap((aresta) =>
      aresta.node.faturas.edges.map(({ node: fatura }) => ({
        origem: 'automatico' as const,
        situacao: fatura.invoiceStatus,
        vence: fatura.dueAt,
        pagaEm: fatura.paidAt,
      })),
    ),
  ];

  const situacao = situacaoDeCobranca(cobrancas);

  if (!situacao.emAtraso) {
    return null;
  }

  const total =
    situacao.atrasadasPorOrigem.manual + situacao.atrasadasPorOrigem.automatico;

  return (
    <span
      className="adm-chip adm-chip--rose"
      title={`${situacao.atrasadasPorOrigem.manual} no financeiro manual, ${situacao.atrasadasPorOrigem.automatico} no automático`}
    >
      Em atraso · {total}
    </span>
  );
};
