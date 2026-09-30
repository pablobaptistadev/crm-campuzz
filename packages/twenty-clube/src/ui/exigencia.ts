import { gql } from 'src/api/client';
import { paginar } from './paginar';

export type Escopo = 'CLUBE' | 'MEMBRO';

// Vazio é obrigatória: o campo nasceu depois das etapas, e "começa tudo
// obrigatório" é justamente não ter marcado nada.
export const ehOpcional = (etapa: { opcional?: boolean | null }): boolean =>
  etapa.opcional === true;

const DONO: Record<Escopo, string> = { CLUBE: 'clubeId', MEMBRO: 'membroId' };

type Irma = { id: string; opcional: boolean | null };

// A mesma etapa em todos os clubes (ou em todos os membros). Casa pelo nome e
// pelo escopo, e só entre as que têm dono: as órfãs de importação não são de
// ninguém e não entram na conta.
export const carregarEtapasIrmas = (nome: string, escopo: Escopo) =>
  paginar<Irma>(
    `query EtapasIrmas($nome: String!, $after: String) {
      etapasJornada(
        first: 1000
        after: $after
        filter: { name: { eq: $nome }, escopo: { eq: "${escopo}" }, ${DONO[escopo]}: { is: NOT_NULL } }
      ) {
        pageInfo { hasNextPage endCursor }
        edges { node { id opcional } }
      }
    }`,
    'etapasJornada',
    { nome },
  );

const MARCAR = `
  mutation MarcarExigencia($id: UUID!, $data: EtapaJornadaUpdateInput!) {
    updateEtapaJornada(id: $id, data: $data) { id opcional }
  }
`;

export const gravarExigencia = (etapaId: string, opcional: boolean) =>
  gql(MARCAR, { id: etapaId, data: { opcional } });

// Um clube ou membro novo nasce com as mesmas etapas opcionais que os outros
// já têm: sem isso, depois de um "aplicar a todos", o próximo clube criado
// voltaria a cobrar a etapa que a equipe decidiu que é opcional.
export const nomesDasEtapasOpcionais = async (escopo: Escopo): Promise<Set<string>> => {
  try {
    const opcionais = await paginar<{ name: string }>(
      `query EtapasOpcionais($after: String) {
        etapasJornada(
          first: 1000
          after: $after
          filter: { escopo: { eq: "${escopo}" }, opcional: { eq: true }, ${DONO[escopo]}: { is: NOT_NULL } }
        ) {
          pageInfo { hasNextPage endCursor }
          edges { node { name } }
        }
      }`,
      'etapasJornada',
    );

    return new Set(opcionais.map((etapa) => etapa.name));
  } catch {
    // Sem a lista, a etapa nasce obrigatória — o padrão de sempre.
    return new Set();
  }
};
