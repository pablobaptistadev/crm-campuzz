import { useEffect, useState } from 'react';

import { gql } from 'src/api/client';

export type Autor = {
  id: string;
  avatarUrl: string | null;
  name: { firstName: string | null; lastName: string | null } | null;
};

// Inclui quem já saiu do workspace: a anotação continua sendo de quem a
// escreveu, e sem isso ela passava a dizer "Autor não registrado".
const AUTORES_QUERY = `
  query Autores {
    workspaceMembers(
      first: 200
      filter: { or: [{ deletedAt: { is: NULL } }, { deletedAt: { is: NOT_NULL } }] }
    ) {
      edges { node { id avatarUrl name { firstName lastName } } }
    }
  }
`;

// Uma vez por carga da página, e compartilhada por todo histórico aberto nela.
// O workspace tem poucos usuários, e pedir o autor dentro de cada linha custava
// uma ida ao banco por linha: medido, +1,1 s num histórico de 9 linhas.
let emCurso: Promise<Map<string, Autor>> | null = null;

export const carregarAutores = (): Promise<Map<string, Autor>> => {
  if (emCurso === null) {
    emCurso = gql<{ workspaceMembers: { edges: { node: Autor }[] } }>(AUTORES_QUERY)
      .then(
        (dados) =>
          new Map(dados.workspaceMembers.edges.map(({ node }) => [node.id, node])),
      )
      .catch((causa) => {
        // Sem isto, uma falha passageira ficaria guardada e nenhum histórico
        // mostraria autor até recarregar a página.
        emCurso = null;
        throw causa;
      });
  }

  return emCurso;
};

// Quem trocou a própria foto ou o nome quer se ver atualizado no histórico sem
// recarregar a página.
export const esquecerAutores = (): void => {
  emCurso = null;
};

export const useAutores = (): Map<string, Autor> | null => {
  const [autores, setAutores] = useState<Map<string, Autor> | null>(null);

  useEffect(() => {
    let ativo = true;

    carregarAutores()
      .then((mapa) => {
        if (ativo) {
          setAutores(mapa);
        }
      })
      .catch(() => {
        // O histórico continua legível sem autor; a linha diz que não sabe.
      });

    return () => {
      ativo = false;
    };
  }, []);

  return autores;
};
