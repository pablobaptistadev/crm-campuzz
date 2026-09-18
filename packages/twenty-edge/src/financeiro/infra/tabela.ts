import { escapeIdentifier } from 'src/ddl/escape';
import { type WorkspaceMetadata } from 'src/metadata/types';
import {
  buildWorkspaceTableShape,
  type WorkspaceTableShape,
} from 'src/orm/table-shape';

// O core fala COMPANY e PERSON porque foi escrito contra os objetos padrão do
// Twenty. Este workspace não os usa: Clube e Membro são objetos próprios, com
// dezenas de campos que Company e Person não têm. Traduzir aqui é justamente o
// que a porta existe para permitir — o caso de uso continua sem saber o nome
// que cada instalação deu às suas coisas.
export const OBJETO_DO_CLUBE = 'clube';
export const OBJETO_DO_MEMBRO = 'membro';
export const OBJETO_DA_BU = 'businessUnit';

export const formaDaTabela = (
  metadata: WorkspaceMetadata,
  nameSingular: string,
): WorkspaceTableShape => {
  const objeto = metadata.objects.find(
    (candidato) => candidato.nameSingular === nameSingular && candidato.isActive,
  );

  if (objeto === undefined) {
    throw new Error(
      `O objeto "${nameSingular}" não existe neste workspace. O financeiro de gateway depende dele.`,
    );
  }

  return buildWorkspaceTableShape({
    object: objeto,
    workspaceId: metadata.workspaceId,
  });
};

export const tabelaDe = (
  metadata: WorkspaceMetadata,
  nameSingular: string,
): string => {
  const forma = formaDaTabela(metadata, nameSingular);

  return `${escapeIdentifier(forma.schemaName)}.${escapeIdentifier(forma.tableName)}`;
};

// O nome da coluna de junção sai do metadata, não de uma convenção escrita à
// mão: quem criou o campo escolheu o nome dele, e adivinhar aqui quebraria em
// silêncio no dia em que alguém criasse a relação com outro nome.
export const colunaDaRelacao = (
  metadata: WorkspaceMetadata,
  nameSingular: string,
  fieldName: string,
): string => {
  const relacao = formaDaTabela(metadata, nameSingular).relationShapeByFieldName.get(
    fieldName,
  );

  if (relacao === undefined) {
    throw new Error(
      `O objeto "${nameSingular}" não tem a relação "${fieldName}". O financeiro de gateway depende dela.`,
    );
  }

  return relacao.joinColumnName;
};
