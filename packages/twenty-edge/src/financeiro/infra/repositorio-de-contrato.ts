import { type Client } from 'pg';

import {
  type ContractHolder,
  type GatewayContract,
  paidInvoiceCountOf,
  type StoredContract,
  totalValueOf,
} from 'src/financeiro/core/domain/entities/gateway-contract.entity';
import { type ContractRepositoryPort } from 'src/financeiro/core/ports/contract-repository.port';
import { escapeIdentifier } from 'src/ddl/escape';
import {
  colunaDaRelacao,
  OBJETO_DA_BU,
  OBJETO_DO_CLUBE,
  OBJETO_DO_CONTRATO,
  OBJETO_DO_MEMBRO,
  tabelaDe,
} from 'src/financeiro/infra/tabela';
import { type WorkspaceMetadata } from 'src/metadata/types';

type Linha = {
  id: string;
  externalSubscriptionId: string | null;
  externalTransactionId: string | null;
  businessUnitId: string | null;
  clubeId: string | null;
  membroId: string | null;
};

// Um contrato pertence a um clube OU a um membro, nunca aos dois. Se o banco
// tiver os dois preenchidos, o membro ganha: é o vínculo mais específico, e é o
// que a pessoa vê na tela em que vinculou.
const donoDe = (linha: Linha): ContractHolder => {
  if (linha.membroId !== null) {
    return { type: 'PERSON', recordId: linha.membroId };
  }

  return { type: 'COMPANY', recordId: linha.clubeId ?? '' };
};

const paraEntidade = (linha: Linha): StoredContract => ({
  id: linha.id,
  externalSubscriptionId: linha.externalSubscriptionId,
  externalTransactionId: linha.externalTransactionId,
  businessUnitId: linha.businessUnitId ?? '',
  holder: donoDe(linha),
});

export const repositorioDeContratoEmPostgres = ({
  client,
  metadata,
}: {
  client: Client;
  metadata: WorkspaceMetadata;
}): ContractRepositoryPort => {
  const contratos = tabelaDe(metadata, OBJETO_DO_CONTRATO);
  const colBu = escapeIdentifier(
    colunaDaRelacao(metadata, OBJETO_DO_CONTRATO, OBJETO_DA_BU),
  );
  const colClube = escapeIdentifier(
    colunaDaRelacao(metadata, OBJETO_DO_CONTRATO, OBJETO_DO_CLUBE),
  );
  const colMembro = escapeIdentifier(
    colunaDaRelacao(metadata, OBJETO_DO_CONTRATO, OBJETO_DO_MEMBRO),
  );

  const SELECAO = `"id", "externalSubscriptionId", "externalTransactionId",
                   ${colBu} AS "businessUnitId",
                   ${colClube} AS "clubeId",
                   ${colMembro} AS "membroId"`;

  const camposDoGateway = (contrato: GatewayContract) => ({
    name: contrato.code ?? contrato.subscriptionId ?? contrato.transactionId ?? '',
    externalSubscriptionId: contrato.subscriptionId,
    externalTransactionId: contrato.transactionId,
    contractKind: contrato.kind,
    contractStatus: contrato.status,
    amountMicros: contrato.amount.amountMicros,
    currencyCode: contrato.amount.currencyCode,
    frequency: contrato.frequency,
    frequencyInterval: contrato.frequencyInterval,
    startsAt: contrato.startsAt,
    endsAt: contrato.endsAt,
    nextChargeAt: contrato.nextChargeAt,
    paymentMethod: contrato.paymentMethod,
    customerEmail: contrato.customer.email,
    customerDocument: contrato.customer.document,
    // Derivados das faturas, nao lidos do gateway: a Routerfy nao manda total
    // nem contagem de pagas. Sem gravar, o cabecalho do contrato na tela do
    // financeiro automatico mostrava um traco no lugar do valor.
    totalMicros: totalValueOf(contrato).amountMicros,
    paidInvoicesCount: paidInvoiceCountOf(contrato),
  });

  return {
    // Um NULL nunca casa com outro NULL: sem os guardas, uma transação sem
    // subscriptionId acharia qualquer outra que também não tivesse, e a trava de
    // duplicata recusaria contratos que não são o mesmo.
    findByExternalIds: async ({ subscriptionId, transactionId }) => {
      if (subscriptionId === null && transactionId === null) {
        return null;
      }

      const { rows } = await client.query<Linha>(
        `SELECT ${SELECAO} FROM ${contratos}
         WHERE "deletedAt" IS NULL
           AND (($1::text IS NOT NULL AND "externalSubscriptionId" = $1)
             OR ($2::text IS NOT NULL AND "externalTransactionId" = $2))
         LIMIT 1`,
        [subscriptionId, transactionId],
      );

      return rows[0] === undefined ? null : paraEntidade(rows[0]);
    },

    findById: async (contractId) => {
      const { rows } = await client.query<Linha>(
        `SELECT ${SELECAO} FROM ${contratos}
         WHERE "id" = $1 AND "deletedAt" IS NULL`,
        [contractId],
      );

      return rows[0] === undefined ? null : paraEntidade(rows[0]);
    },

    listActive: async () => {
      const { rows } = await client.query<Linha>(
        `SELECT ${SELECAO} FROM ${contratos}
         WHERE "deletedAt" IS NULL
           AND COALESCE("contractStatus", '') NOT IN ('canceled', 'CANCELED', 'cancelled')`,
      );

      return rows.map(paraEntidade);
    },

    listByHolder: async (holder) => {
      const coluna = holder.type === 'PERSON' ? colMembro : colClube;

      const { rows } = await client.query<Linha>(
        `SELECT ${SELECAO} FROM ${contratos}
         WHERE ${coluna} = $1 AND "deletedAt" IS NULL
         ORDER BY "createdAt" DESC`,
        [holder.recordId],
      );

      return rows.map(paraEntidade);
    },

    create: async (draft) => {
      const campos = camposDoGateway(draft.contract);

      const { rows } = await client.query<Linha>(
        `INSERT INTO ${contratos}
           ("name","externalSubscriptionId","externalTransactionId","contractKind",
            "contractStatus","amountAmountMicros","amountCurrencyCode",
            "frequency","frequencyInterval","startsAt","endsAt","nextChargeAt",
            "paymentMethod","customerEmail","customerDocument",
            "totalValueAmountMicros","totalValueCurrencyCode","paidInvoicesCount",
            ${colBu}, ${colClube}, ${colMembro})
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
                 $10::timestamptz,$11::timestamptz,$12::timestamptz,
                 $13,$14,$15,$16,$17,$18,$19,$20,$21)
         RETURNING ${SELECAO}`,
        [
          campos.name,
          campos.externalSubscriptionId,
          campos.externalTransactionId,
          campos.contractKind,
          campos.contractStatus,
          campos.amountMicros,
          campos.currencyCode,
          campos.frequency,
          campos.frequencyInterval,
          campos.startsAt,
          campos.endsAt,
          campos.nextChargeAt,
          campos.paymentMethod,
          campos.customerEmail,
          campos.customerDocument,
          campos.totalMicros,
          campos.currencyCode,
          campos.paidInvoicesCount,
          draft.businessUnitId,
          draft.holder.type === 'COMPANY' ? draft.holder.recordId : null,
          draft.holder.type === 'PERSON' ? draft.holder.recordId : null,
        ],
      );

      return paraEntidade(rows[0] as Linha);
    },

    // Dono e BU ficam de fora: releitura no gateway atualiza o que é do gateway.
    // Mexer no vínculo aqui deixaria um evento mover o contrato de registro.
    updateFromGateway: async (contractId, contrato) => {
      const campos = camposDoGateway(contrato);

      await client.query(
        `UPDATE ${contratos} SET
           "contractStatus" = $2,
           "amountAmountMicros" = $3,
           "amountCurrencyCode" = $4,
           "frequency" = $5,
           "frequencyInterval" = $6,
           "startsAt" = $7::timestamptz,
           "endsAt" = $8::timestamptz,
           "nextChargeAt" = $9::timestamptz,
           "paymentMethod" = $10,
           "totalValueAmountMicros" = $11,
           "totalValueCurrencyCode" = $4,
           "paidInvoicesCount" = $12,
           "updatedAt" = now()
         WHERE "id" = $1`,
        [
          contractId,
          campos.contractStatus,
          campos.amountMicros,
          campos.currencyCode,
          campos.frequency,
          campos.frequencyInterval,
          campos.startsAt,
          campos.endsAt,
          campos.nextChargeAt,
          campos.paymentMethod,
          campos.totalMicros,
          campos.paidInvoicesCount,
        ],
      );
    },
  };
};
