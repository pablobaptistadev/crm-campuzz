import { type Client } from 'pg';

import { escapeIdentifier } from 'src/ddl/escape';
import { getWorkspaceSchemaName } from 'src/metadata/naming';
import { type WorkspaceTableShape } from 'src/orm/table-shape';

export type Autor = {
  workspaceMemberId: string;
  nome: string;
};

export type OrigemDaCriacao = 'MANUAL' | 'IMPORT';

// Uma busca por requisição, não por linha: a criação em lote de uma importação
// perguntaria quem é o autor mil vezes para receber mil vezes a mesma resposta.
// A chave é o client porque ele nasce e morre com a requisição — um objeto
// montado na chamada seria novo a cada linha e o cache nunca acertaria.
const autorPorRequisicao = new WeakMap<Client, Promise<Autor | null>>();

export const autorDaSessao = (contexto: {
  client: Client;
  workspaceId: string;
  userId: string | null;
}): Promise<Autor | null> => {
  if (contexto.userId === null) {
    return Promise.resolve(null);
  }

  const emCache = autorPorRequisicao.get(contexto.client);

  if (emCache !== undefined) {
    return emCache;
  }

  const schema = escapeIdentifier(getWorkspaceSchemaName(contexto.workspaceId));
  const busca = contexto.client
    .query<{ id: string; primeiro: string | null; ultimo: string | null; email: string | null }>(
      `SELECT "id", "nameFirstName" AS "primeiro", "nameLastName" AS "ultimo",
              "userEmail" AS "email"
       FROM ${schema}."workspaceMember"
       WHERE "userId" = $1 AND "deletedAt" IS NULL
       LIMIT 1`,
      [contexto.userId],
    )
    .then(({ rows }) => {
      const linha = rows[0];

      if (linha === undefined) {
        return null;
      }

      const nome = [linha.primeiro, linha.ultimo]
        .filter((parte) => parte !== null && parte.trim() !== '')
        .join(' ')
        .trim();

      return { workspaceMemberId: linha.id, nome: nome || linha.email || 'Usuário' };
    });

  autorPorRequisicao.set(contexto.client, busca);

  return busca;
};

/**
 * Carimba quem criou, a partir da sessão.
 *
 * Autoria de auditoria não pode vir do cliente: quem monta o corpo da
 * requisição poderia assinar pelo colega. Por isso o carimbo sobrescreve o que
 * chegou, em vez de só preencher o que faltou.
 *
 * A anotação da linha do tempo guarda o autor em `workspaceMemberId`, e é por
 * ele que o histórico mostra foto e nome. Antes deste carimbo as anotações
 * nasciam sem autor — as automáticas tinham, as escritas à mão não, justamente
 * as que alguém precisa saber quem escreveu.
 */
export const carimbarAutoria = ({
  shape,
  nomeDoObjeto,
  dados,
  autor,
  origem,
}: {
  shape: WorkspaceTableShape;
  nomeDoObjeto: string;
  dados: Record<string, unknown>;
  autor: Autor | null;
  origem: OrigemDaCriacao;
}): Record<string, unknown> => {
  if (autor === null) {
    return dados;
  }

  const carimbado: Record<string, unknown> = { ...dados };

  if (shape.columnShapeByColumnName.has('createdBySource')) {
    carimbado.createdBy = {
      source: origem,
      workspaceMemberId: autor.workspaceMemberId,
      name: autor.nome,
      context: {},
    };
  }

  if (
    nomeDoObjeto === 'timelineActivity' &&
    shape.columnShapeByColumnName.has('workspaceMemberId')
  ) {
    carimbado.workspaceMemberId = autor.workspaceMemberId;
  }

  return carimbado;
};
