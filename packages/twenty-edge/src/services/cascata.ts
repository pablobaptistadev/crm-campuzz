import { type Client } from 'pg';

import { escapeIdentifier } from 'src/ddl/escape';
import { type FlatObjectMetadata, type WorkspaceMetadata } from 'src/metadata/types';
import { type WorkspaceTableShape } from 'src/orm/table-shape';

export type ArestaDePosse = {
  objetoFilhoId: string;
  nomeDoFilho: string;
  tabela: string;
  colunaDoPai: string;
};

export type GrafoDePosse = Map<string, ArestaDePosse[]>;

export type LinhaTocada = { objeto: string; quantidade: number };

// Um clube é dono dos seus membros, e um membro é dono das suas parcelas: tirar
// o pai do painel tem de tirar junto o que só existe por causa dele. A posse é
// a relação MANY_TO_ONE de um objeto do workspace para outro — anexo, nota,
// tarefa e timeline ficam de fora porque registram o que aconteceu e não
// pertencem a ninguém.
export const montarGrafoDePosse = ({
  metadata,
  shapeByObjectId,
}: {
  metadata: WorkspaceMetadata;
  shapeByObjectId: Map<string, WorkspaceTableShape>;
}): GrafoDePosse => {
  const grafo: GrafoDePosse = new Map();
  const objetoPorId = new Map<string, FlatObjectMetadata>(
    metadata.objects.map((objeto) => [objeto.id, objeto]),
  );

  for (const filho of metadata.objects) {
    if (!filho.isCustom || !filho.isActive) {
      continue;
    }

    const shapeDoFilho = shapeByObjectId.get(filho.id);

    if (shapeDoFilho === undefined || !shapeDoFilho.hasDeletedAtColumn) {
      continue;
    }

    for (const relacao of shapeDoFilho.relationShapeByFieldName.values()) {
      if (relacao.relationType !== 'MANY_TO_ONE') {
        continue;
      }

      const pai = objetoPorId.get(relacao.targetObjectMetadataId);

      if (pai === undefined || !pai.isCustom) {
        continue;
      }

      const existentes = grafo.get(pai.id) ?? [];

      existentes.push({
        objetoFilhoId: filho.id,
        nomeDoFilho: filho.nameSingular,
        tabela: `${escapeIdentifier(shapeDoFilho.schemaName)}.${escapeIdentifier(shapeDoFilho.tableName)}`,
        colunaDoPai: relacao.joinColumnName,
      });

      grafo.set(pai.id, existentes);
    }
  }

  return grafo;
};

// Sem teto, um grafo com ciclo rodaria para sempre. A hierarquia real tem três
// níveis (clube → membro → venda → parcela); oito é folga, não limite de uso.
const PROFUNDIDADE_MAXIMA = 8;

type Passo = { objetoId: string; ids: string[]; profundidade: number };

const somar = (tocadas: LinhaTocada[], objeto: string, quantidade: number) => {
  if (quantidade === 0) {
    return;
  }

  const existente = tocadas.find((linha) => linha.objeto === objeto);

  if (existente === undefined) {
    tocadas.push({ objeto, quantidade });

    return;
  }

  existente.quantidade += quantidade;
};

const percorrer = async ({
  client,
  grafo,
  raiz,
  executar,
}: {
  client: Client;
  grafo: GrafoDePosse;
  raiz: Passo;
  executar: (
    aresta: ArestaDePosse,
    idsDoPai: string[],
  ) => { text: string; values: unknown[] };
}): Promise<LinhaTocada[]> => {
  const tocadas: LinhaTocada[] = [];
  const fila: Passo[] = [raiz];

  while (fila.length > 0) {
    const passo = fila.shift() as Passo;

    if (passo.profundidade >= PROFUNDIDADE_MAXIMA || passo.ids.length === 0) {
      continue;
    }

    for (const aresta of grafo.get(passo.objetoId) ?? []) {
      const consulta = executar(aresta, passo.ids);
      const { rows } = await client.query<{ id: string }>(
        consulta.text,
        consulta.values,
      );

      somar(tocadas, aresta.nomeDoFilho, rows.length);

      if (rows.length > 0) {
        fila.push({
          objetoId: aresta.objetoFilhoId,
          ids: rows.map((linha) => linha.id),
          profundidade: passo.profundidade + 1,
        });
      }
    }
  }

  return tocadas;
};

export const arquivarEmCascata = ({
  client,
  grafo,
  objetoId,
  ids,
  arquivadoEm,
}: {
  client: Client;
  grafo: GrafoDePosse;
  objetoId: string;
  ids: string[];
  arquivadoEm: string;
}): Promise<LinhaTocada[]> =>
  percorrer({
    client,
    grafo,
    raiz: { objetoId, ids, profundidade: 0 },
    // Carimbar o mesmo instante do pai é o que torna o restaurar possível:
    // sem coluna nova, o horário é a única marca que diz quem saiu junto.
    executar: (aresta, idsDoPai) => ({
      text: `UPDATE ${aresta.tabela}
             SET ${escapeIdentifier('deletedAt')} = $1::timestamptz,
                 ${escapeIdentifier('updatedAt')} = now()
             WHERE ${escapeIdentifier(aresta.colunaDoPai)} = ANY($2::uuid[])
               AND ${escapeIdentifier('deletedAt')} IS NULL
             RETURNING ${escapeIdentifier('id')}`,
      values: [arquivadoEm, idsDoPai],
    }),
  });

export const restaurarEmCascata = ({
  client,
  grafo,
  objetoId,
  ids,
  arquivadoEm,
}: {
  client: Client;
  grafo: GrafoDePosse;
  objetoId: string;
  ids: string[];
  arquivadoEm: string;
}): Promise<LinhaTocada[]> =>
  percorrer({
    client,
    grafo,
    raiz: { objetoId, ids, profundidade: 0 },
    // Só volta quem saiu no mesmo instante que o pai. Um membro arquivado
    // sozinho na semana passada tem outro horário e continua arquivado — era
    // uma decisão de quem arquivou, não efeito colateral do clube.
    executar: (aresta, idsDoPai) => ({
      text: `UPDATE ${aresta.tabela}
             SET ${escapeIdentifier('deletedAt')} = NULL,
                 ${escapeIdentifier('updatedAt')} = now()
             WHERE ${escapeIdentifier(aresta.colunaDoPai)} = ANY($2::uuid[])
               AND ${escapeIdentifier('deletedAt')} = $1::timestamptz
             RETURNING ${escapeIdentifier('id')}`,
      values: [arquivadoEm, idsDoPai],
    }),
  });
