import { paginar } from 'src/ui/paginar';

// Listas achatadas que os painéis (Financeiro, Radar, Pendências, Exportar)
// cruzam em memória. Nada aninhado: o edge resolve relação linha a linha, e
// uma relação dentro de 160 membros vira 160 idas ao banco. Achatado, o custo
// é o mesmo com 10 ou 1.000 registros — uma página de até 1.000 por lista.

type Moeda = { amountMicros: number | null; currencyCode: string | null } | null;

export type MembroDaLista = {
  id: string;
  name: string;
  clubeId: string | null;
  situacao: string | null;
  papel: string | null;
  fotoUrl: string | null;
  nascimento: string | null;
  entradaEm: string | null;
  emails: { primaryEmail: string | null } | null;
  emailFinanceiro: string | null;
  inadimplenciaMarcada: boolean | null;
  inadimplenciaValor: Moeda;
  inadimplenciaVencimento: string | null;
};

export type ClubeDaLista = {
  id: string;
  name: string;
  situacao: string | null;
  fotoUrl: string | null;
  mentor: string | null;
  responsavel: string | null;
  inicio: string | null;
  mouSituacao: string | null;
  mouValidade: string | null;
};

export type ParcelaDaLista = {
  id: string;
  name: string;
  numero: number | null;
  situacao: string | null;
  vencimento: string | null;
  pagaEm: string | null;
  lembreteEm: string | null;
  valor: Moeda;
  formaPagamento: string | null;
  membroId: string | null;
  clubeId: string | null;
};

export type ContratoDaLista = {
  id: string;
  membroId: string | null;
  clubeId: string | null;
};

export type FaturaDaLista = {
  id: string;
  contratoId: string | null;
  invoiceStatus: string | null;
  dueAt: string | null;
  paidAt: string | null;
  amount: Moeda;
};

const MOEDA = `{ amountMicros currencyCode }`;

const MEMBROS = `
  query ListaDeMembros($after: String) {
    membros(first: 1000, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges { node {
        id name clubeId situacao papel fotoUrl nascimento entradaEm
        emails { primaryEmail } emailFinanceiro
        inadimplenciaMarcada inadimplenciaValor ${MOEDA} inadimplenciaVencimento
      } }
    }
  }
`;

const CLUBES = `
  query ListaDeClubes($after: String) {
    clubes(first: 1000, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges { node {
        id name situacao fotoUrl mentor responsavel inicio mouSituacao mouValidade
      } }
    }
  }
`;

const PARCELAS = `
  query ListaDeParcelas($after: String) {
    parcelas(first: 1000, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges { node {
        id name numero situacao vencimento pagaEm lembreteEm
        valor ${MOEDA} formaPagamento membroId clubeId
      } }
    }
  }
`;

const CONTRATOS = `
  query ListaDeContratos($after: String) {
    gatewayContracts(first: 1000, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges { node { id membroId clubeId } }
    }
  }
`;

const FATURAS = `
  query ListaDeFaturas($after: String) {
    gatewayInvoices(first: 1000, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges { node { id contratoId invoiceStatus dueAt paidAt amount ${MOEDA} } }
    }
  }
`;

export const carregarMembros = () => paginar<MembroDaLista>(MEMBROS, 'membros');

export const carregarClubes = () => paginar<ClubeDaLista>(CLUBES, 'clubes');

export const carregarParcelas = () => paginar<ParcelaDaLista>(PARCELAS, 'parcelas');

// Um workspace sem o financeiro automático não tem esses objetos. Ali isso é
// "nenhum contrato", não uma tela quebrada.
export const carregarContratosDoGateway = () =>
  paginar<ContratoDaLista>(CONTRATOS, 'gatewayContracts').catch(() => []);

export const carregarFaturasDoGateway = () =>
  paginar<FaturaDaLista>(FATURAS, 'gatewayInvoices').catch(() => []);

export type SocioDaLista = { id: string; name: string; nascimento: string | null; clubeId: string | null };

export type DependenteDaLista = {
  id: string;
  name: string;
  nascimento: string | null;
  parentesco: string | null;
  membroId: string | null;
};

export type EtapaDaLista = {
  id: string;
  name: string;
  escopo: string | null;
  ordem: number | null;
  situacao: string | null;
  prazo: string | null;
  concluidaEm: string | null;
  responsavel: string | null;
  opcional: boolean | null;
  clubeId: string | null;
  membroId: string | null;
};

export type EventoDeEtapa = {
  targetEtapaJornadaId: string | null;
  happensAt: string | null;
  workspaceMemberId: string | null;
  properties: { diff?: Record<string, { before?: unknown; after?: unknown }> } | null;
};

const ETAPA = `id name escopo ordem situacao prazo concluidaEm responsavel opcional clubeId membroId`;

const SOCIOS = `
  query ListaDeSocios($after: String) {
    socios(first: 1000, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges { node { id name nascimento clubeId } }
    }
  }
`;

const DEPENDENTES = `
  query ListaDeDependentes($after: String) {
    dependentes(first: 1000, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges { node { id name nascimento parentesco membroId } }
    }
  }
`;

export const carregarSocios = () => paginar<SocioDaLista>(SOCIOS, 'socios');

export const carregarDependentes = () => paginar<DependenteDaLista>(DEPENDENTES, 'dependentes');

const DATA = /^\d{4}-\d{2}-\d{2}$/;

// Só o que o radar usa: etapa com prazo, ou concluída desde a data pedida. As
// outras mil e tantas etapas pendentes sem prazo não geram evento nenhum.
export const carregarEtapasDoRadar = (desde: string) => {
  if (!DATA.test(desde)) {
    throw new Error(`Data inválida: ${desde}`);
  }

  return paginar<EtapaDaLista>(
    `query EtapasDoRadar($after: String) {
      etapasJornada(
        first: 1000
        after: $after
        filter: { or: [{ prazo: { is: NOT_NULL } }, { concluidaEm: { gte: "${desde}" } }] }
      ) {
        pageInfo { hasNextPage endCursor }
        edges { node { ${ETAPA} } }
      }
    }`,
    'etapasJornada',
  );
};

// Toda etapa com dono, de clube e de membro. As 2.101 etapas órfãs de uma
// importação antiga (sem clube nem membro) ficam de fora já na consulta.
export const carregarEtapasComDono = () =>
  Promise.all([
    paginar<EtapaDaLista>(
      `query EtapasDeClube($after: String) {
        etapasJornada(first: 1000, after: $after, filter: { escopo: { eq: "CLUBE" }, clubeId: { is: NOT_NULL } }) {
          pageInfo { hasNextPage endCursor }
          edges { node { ${ETAPA} } }
        }
      }`,
      'etapasJornada',
    ),
    paginar<EtapaDaLista>(
      `query EtapasDeMembro($after: String) {
        etapasJornada(first: 1000, after: $after, filter: { escopo: { eq: "MEMBRO" }, membroId: { is: NOT_NULL } }) {
          pageInfo { hasNextPage endCursor }
          edges { node { ${ETAPA} } }
        }
      }`,
      'etapasJornada',
    ),
  ]).then(([doClube, doMembro]) => [...doClube, ...doMembro]);

// As mudanças de etapa registradas no histórico desde a data pedida — é daqui
// que sai quem concluiu cada uma.
export const carregarEventosDeEtapa = (desde: string) => {
  if (!DATA.test(desde)) {
    throw new Error(`Data inválida: ${desde}`);
  }

  return paginar<EventoDeEtapa>(
    `query EventosDeEtapa($after: String) {
      timelineActivities(
        first: 1000
        after: $after
        filter: { name: { eq: "updated" }, targetEtapaJornadaId: { is: NOT_NULL }, happensAt: { gte: "${desde}" } }
      ) {
        pageInfo { hasNextPage endCursor }
        edges { node { targetEtapaJornadaId happensAt workspaceMemberId properties } }
      }
    }`,
    'timelineActivities',
  );
};
