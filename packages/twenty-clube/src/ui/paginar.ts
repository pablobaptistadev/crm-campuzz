import { gql } from 'src/api/client';

type Pagina<TNo> = {
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  edges: { node: TNo }[];
};

// A API limita a página em 200; quem chama quer a lista inteira.
export const paginar = async <TNo>(query: string, campo: string): Promise<TNo[]> => {
  const acumulado: TNo[] = [];
  let cursor: string | null = null;

  for (;;) {
    const resposta: Record<string, Pagina<TNo>> = await gql<Record<string, Pagina<TNo>>>(
      query,
      { after: cursor },
    );
    const pagina: Pagina<TNo> | undefined = resposta[campo];

    if (pagina === undefined) {
      break;
    }

    acumulado.push(...pagina.edges.map((aresta) => aresta.node));

    if (!pagina.pageInfo.hasNextPage) {
      break;
    }

    cursor = pagina.pageInfo.endCursor;
  }

  return acumulado;
};
