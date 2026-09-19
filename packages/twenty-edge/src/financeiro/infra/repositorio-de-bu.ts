import { type Client } from 'pg';

import { type BusinessUnit } from 'src/financeiro/core/domain/entities/business-unit.entity';
import { type BusinessUnitRepositoryPort } from 'src/financeiro/core/ports/business-unit-repository.port';
import { escapeIdentifier } from 'src/ddl/escape';
import {
  colunaDaRelacao,
  OBJETO_DA_BU,
  OBJETO_DO_CLUBE,
  OBJETO_DO_MEMBRO,
  tabelaDe,
} from 'src/financeiro/infra/tabela';
import { type WorkspaceMetadata } from 'src/metadata/types';

type Linha = {
  id: string;
  name: string | null;
  gatewayProvider: string | null;
  apiKeyPreview: string | null;
  keyFingerprint: string | null;
  webhookRegistrationId: string | null;
  gatewayWebhookId: string | null;
  connectionStatus: string | null;
  lastValidatedAt: Date | string | null;
  isDefault: boolean | null;
};

const NOMES_DAS_COLUNAS = [
  'id',
  'name',
  'gatewayProvider',
  'apiKeyPreview',
  'keyFingerprint',
  'webhookRegistrationId',
  'gatewayWebhookId',
  'connectionStatus',
  'lastValidatedAt',
  'isDefault',
].map((nome) => escapeIdentifier(nome));

const COLUNAS = NOMES_DAS_COLUNAS.join(', ');

const colunasComPrefixo = (prefixo: string): string =>
  NOMES_DAS_COLUNAS.map((nome) => `${prefixo}.${nome}`).join(', ');

// O driver devolve timestamptz como Date. A entidade guarda ISO 8601 em texto,
// então converter aqui é o que impede a data de vazar como "[object Object]"
// para dentro do domínio.
const comoIso = (valor: Date | string | null): string | null => {
  if (valor === null) {
    return null;
  }

  return valor instanceof Date ? valor.toISOString() : valor;
};

const paraEntidade = (linha: Linha): BusinessUnit => ({
  id: linha.id,
  name: linha.name ?? '',
  gatewayProvider: 'ROUTERFY',
  apiKeyPreview: linha.apiKeyPreview ?? '',
  keyFingerprint: linha.keyFingerprint ?? '',
  webhookRegistrationId: linha.webhookRegistrationId,
  gatewayWebhookId: linha.gatewayWebhookId,
  connectionStatus:
    linha.connectionStatus === 'ACTIVE' || linha.connectionStatus === 'INVALID'
      ? linha.connectionStatus
      : 'PENDING',
  lastValidatedAt: comoIso(linha.lastValidatedAt),
  isDefault: linha.isDefault === true,
});

export const repositorioDeBuEmPostgres = ({
  client,
  metadata,
}: {
  client: Client;
  metadata: WorkspaceMetadata;
}): BusinessUnitRepositoryPort => {
  const bus = tabelaDe(metadata, OBJETO_DA_BU);

  const porDono = async (
    objetoDoDono: string,
    donoId: string,
  ): Promise<BusinessUnit | null> => {
    const dono = tabelaDe(metadata, objetoDoDono);
    const colunaDaBu = escapeIdentifier(
      colunaDaRelacao(metadata, objetoDoDono, 'businessUnit'),
    );

    const { rows } = await client.query<Linha>(
      `SELECT ${colunasComPrefixo('bu')}
       FROM ${dono} dono
       JOIN ${bus} bu ON bu."id" = dono.${colunaDaBu} AND bu."deletedAt" IS NULL
       WHERE dono."id" = $1 AND dono."deletedAt" IS NULL`,
      [donoId],
    );

    return rows[0] === undefined ? null : paraEntidade(rows[0]);
  };

  return {
    findById: async (businessUnitId) => {
      const { rows } = await client.query<Linha>(
        `SELECT ${COLUNAS} FROM ${bus}
         WHERE "id" = $1 AND "deletedAt" IS NULL`,
        [businessUnitId],
      );

      return rows[0] === undefined ? null : paraEntidade(rows[0]);
    },

    // Ordenado por criação, não só filtrado: duas BUs marcadas como padrão
    // fariam a resolução depender da ordem que o banco devolvesse — que é
    // exatamente o bug que a porta manda evitar.
    findDefault: async () => {
      const { rows } = await client.query<Linha>(
        `SELECT ${COLUNAS} FROM ${bus}
         WHERE "isDefault" = true AND "deletedAt" IS NULL
         ORDER BY "createdAt" ASC
         LIMIT 1`,
      );

      return rows[0] === undefined ? null : paraEntidade(rows[0]);
    },

    findByCompanyId: (companyId) => porDono(OBJETO_DO_CLUBE, companyId),
    findByPersonId: (personId) => porDono(OBJETO_DO_MEMBRO, personId),

    listAll: async () => {
      const { rows } = await client.query<Linha>(
        `SELECT ${COLUNAS} FROM ${bus}
         WHERE "deletedAt" IS NULL
         ORDER BY "isDefault" DESC, "name" ASC`,
      );

      return rows.map(paraEntidade);
    },

    save: async (draft) => {
      const { rows } = await client.query<Linha>(
        `INSERT INTO ${bus}
           ("id","name","gatewayProvider","apiKeyPreview","keyFingerprint",
            "webhookRegistrationId","gatewayWebhookId","connectionStatus",
            "lastValidatedAt","isDefault")
         VALUES (COALESCE($1::uuid, gen_random_uuid()),
                 $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10)
         ON CONFLICT ("id") DO UPDATE SET
           "name" = EXCLUDED."name",
           "gatewayProvider" = EXCLUDED."gatewayProvider",
           "apiKeyPreview" = EXCLUDED."apiKeyPreview",
           "keyFingerprint" = EXCLUDED."keyFingerprint",
           "webhookRegistrationId" = EXCLUDED."webhookRegistrationId",
           "gatewayWebhookId" = EXCLUDED."gatewayWebhookId",
           "connectionStatus" = EXCLUDED."connectionStatus",
           "lastValidatedAt" = EXCLUDED."lastValidatedAt",
           "isDefault" = EXCLUDED."isDefault",
           "updatedAt" = now()
         RETURNING ${COLUNAS}`,
        [
          draft.id ?? null,
          draft.name,
          draft.gatewayProvider,
          draft.apiKeyPreview,
          draft.keyFingerprint,
          draft.webhookRegistrationId,
          draft.gatewayWebhookId,
          draft.connectionStatus,
          draft.lastValidatedAt,
          draft.isDefault,
        ],
      );

      return paraEntidade(rows[0] as Linha);
    },

    clearDefaultExcept: async (businessUnitId) => {
      await client.query(
        `UPDATE ${bus} SET "isDefault" = false, "updatedAt" = now()
         WHERE "isDefault" = true AND "id" <> $1`,
        [businessUnitId],
      );
    },
  };
};
