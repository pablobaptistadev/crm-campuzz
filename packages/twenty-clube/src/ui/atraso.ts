export type Origem = 'manual' | 'automatico';

export type Cobranca = {
  origem: Origem;
  situacao: string | null;
  vence: string | null;
  pagaEm: string | null;
};

// Cada lado tem o seu vocabulário: o manual é o SELECT que o time preencheu, o
// automático é o que o gateway devolve. Traduzir os dois para "está paga" e
// "está atrasada" é o que permite a regra ser uma só.
const PAGA = new Set(['PAGA', 'PAID']);
const ATRASADA = new Set(['ATRASADA', 'OVERDUE', 'EXPIRADA', 'EXPIRED']);
const CANCELADA = new Set(['CANCELADA', 'CANCELED', 'CANCELLED']);

export const estaPaga = (cobranca: Cobranca): boolean =>
  PAGA.has(cobranca.situacao ?? '') || cobranca.pagaEm !== null;

// Vencida e não paga é atraso mesmo que ninguém tenha trocado a tag. Depender só
// do SELECT deixaria uma parcela vencida ontem parecendo em dia até alguém
// lembrar de mexer nela — e é justamente aí que o cliente some.
export const estaAtrasada = (cobranca: Cobranca, hoje: string): boolean => {
  if (estaPaga(cobranca) || CANCELADA.has(cobranca.situacao ?? '')) {
    return false;
  }

  if (ATRASADA.has(cobranca.situacao ?? '')) {
    return true;
  }

  return cobranca.vence !== null && cobranca.vence.slice(0, 10) < hoje;
};

export type Situacao = {
  emAtraso: boolean;
  origensEmAtraso: Origem[];
  atrasadasPorOrigem: Record<Origem, number>;
};

// Um cliente em atraso num dos dois lados está em atraso, ponto. Exigir os dois
// deixaria passar exatamente o caso que interessa: quem pagou no gateway mas
// deve a parcela lançada à mão, ou o contrário.
export const situacaoDeCobranca = (
  cobrancas: readonly Cobranca[],
  hoje: string = new Date().toISOString().slice(0, 10),
): Situacao => {
  const atrasadasPorOrigem: Record<Origem, number> = {
    manual: 0,
    automatico: 0,
  };

  for (const cobranca of cobrancas) {
    if (estaAtrasada(cobranca, hoje)) {
      atrasadasPorOrigem[cobranca.origem] += 1;
    }
  }

  const origensEmAtraso = (['manual', 'automatico'] as const).filter(
    (origem) => atrasadasPorOrigem[origem] > 0,
  );

  return {
    emAtraso: origensEmAtraso.length > 0,
    origensEmAtraso: [...origensEmAtraso],
    atrasadasPorOrigem,
  };
};

type ParcelaManual = {
  situacao: string | null;
  vencimento: string | null;
  pagaEm: string | null;
};

type FaturaDoGateway = {
  invoiceStatus: string | null;
  dueAt: string | null;
  paidAt: string | null;
};

export type ContratosDoRegistro = {
  edges: { node: { faturas: { edges: { node: FaturaDoGateway }[] } } }[];
} | null;

// As duas listas viram uma só aqui, e não em cada tela que precisa da regra: o
// chip da ficha e o filtro da lista de membros perguntam a mesma coisa, e duas
// montagens iguais é como as duas passam a discordar.
export const cobrancasDe = ({
  parcelas,
  contratos,
}: {
  parcelas: readonly ParcelaManual[];
  contratos: ContratosDoRegistro;
}): Cobranca[] => [
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
