import { type Client } from 'pg';

import { type ContractHolder } from 'src/financeiro/core/domain/entities/gateway-contract.entity';
import {
  type CrmDirectoryPort,
  type HolderContact,
} from 'src/financeiro/core/ports/crm-directory.port';
import { escapeIdentifier } from 'src/ddl/escape';
import {
  colunaDaRelacao,
  OBJETO_DO_CLUBE,
  OBJETO_DO_MEMBRO,
  formaDaTabela,
  tabelaDe,
} from 'src/financeiro/infra/tabela';
import { type WorkspaceMetadata } from 'src/metadata/types';

// Campo EMAILS vira várias colunas; a primária é a que vale para a conferência.
const COLUNA_DO_EMAIL_DO_MEMBRO = 'emailsPrimaryEmail';
const CAMPO_DO_EMAIL_DO_CLUBE = 'emailCobranca';

// Clube não tinha e-mail nenhum — nem para lembrete de parcela, nem para conferir
// o titular no gateway. Enquanto o campo não existir, respondemos sem e-mail em
// vez de estourar: o caso de uso já trata "sem e-mail" como motivo para recusar o
// vínculo, e essa recusa explica o problema melhor do que um 500.
const colunaDoEmailDoClube = (metadata: WorkspaceMetadata): string | null => {
  const forma = formaDaTabela(metadata, OBJETO_DO_CLUBE);

  for (const sufixo of ['PrimaryEmail', '']) {
    const candidata = `${CAMPO_DO_EMAIL_DO_CLUBE}${sufixo}`;

    if (forma.columnShapeByColumnName.has(candidata)) {
      return candidata;
    }
  }

  return null;
};

export const diretorioDoCrmEmPostgres = ({
  client,
  metadata,
}: {
  client: Client;
  metadata: WorkspaceMetadata;
}): CrmDirectoryPort => ({
  findHolderContact: async (
    holder: ContractHolder,
  ): Promise<HolderContact | null> => {
    if (holder.type === 'PERSON') {
      const { rows } = await client.query<{
        email: string | null;
        name: string | null;
      }>(
        `SELECT ${escapeIdentifier(COLUNA_DO_EMAIL_DO_MEMBRO)} AS "email",
                "name"
         FROM ${tabelaDe(metadata, OBJETO_DO_MEMBRO)}
         WHERE "id" = $1 AND "deletedAt" IS NULL`,
        [holder.recordId],
      );

      const linha = rows[0];

      return linha === undefined
        ? null
        : {
            email: linha.email === '' ? null : linha.email,
            displayName: linha.name,
          };
    }

    const coluna = colunaDoEmailDoClube(metadata);

    const { rows } = await client.query<{
      email: string | null;
      name: string | null;
    }>(
      `SELECT ${coluna === null ? 'NULL::text' : escapeIdentifier(coluna)} AS "email",
              "name"
       FROM ${tabelaDe(metadata, OBJETO_DO_CLUBE)}
       WHERE "id" = $1 AND "deletedAt" IS NULL`,
      [holder.recordId],
    );

    const linha = rows[0];

    return linha === undefined
      ? null
      : {
          email: linha.email === '' ? null : linha.email,
          displayName: linha.name,
        };
  },

  findCompanyIdForPerson: async (personId) => {
    const coluna = escapeIdentifier(
      colunaDaRelacao(metadata, OBJETO_DO_MEMBRO, OBJETO_DO_CLUBE),
    );

    const { rows } = await client.query<{ clubeId: string | null }>(
      `SELECT ${coluna} AS "clubeId"
       FROM ${tabelaDe(metadata, OBJETO_DO_MEMBRO)}
       WHERE "id" = $1 AND "deletedAt" IS NULL`,
      [personId],
    );

    return rows[0]?.clubeId ?? null;
  },
});
