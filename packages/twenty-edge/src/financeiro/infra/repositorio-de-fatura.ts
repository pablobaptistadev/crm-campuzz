import { type Client } from 'pg';

import { type GatewayInvoice } from 'src/financeiro/core/domain/entities/gateway-contract.entity';
import { DEFAULT_CURRENCY_CODE } from 'src/financeiro/core/domain/value-objects/money.value-object';
import {
  type InvoiceRepositoryPort,
  type InvoiceSummary,
} from 'src/financeiro/core/ports/invoice-repository.port';
import { escapeIdentifier } from 'src/ddl/escape';
import {
  colunaDaRelacao,
  CAMPO_DO_CONTRATO_NA_FATURA,
  OBJETO_DA_FATURA,
  tabelaDe,
} from 'src/financeiro/infra/tabela';
import { type WorkspaceMetadata } from 'src/metadata/types';

// A fatura automatica so tem o vocabulario do dominio; 'PAGA' e do SELECT que
// o time preenche a mao, noutra tabela.
const PAGAS = ['PAID'];

export const repositorioDeFaturaEmPostgres = ({
  client,
  metadata,
}: {
  client: Client;
  metadata: WorkspaceMetadata;
}): InvoiceRepositoryPort => {
  const faturas = tabelaDe(metadata, OBJETO_DA_FATURA);
  const colContrato = escapeIdentifier(
    colunaDaRelacao(metadata, OBJETO_DA_FATURA, CAMPO_DO_CONTRATO_NA_FATURA),
  );

  return {
    // Casa por externalInvoiceId, nunca insere às cegas: webhook e cron cobrem
    // o mesmo dado, e sem isso a segunda passada duplicaria a parcela na tela.
    // UPDATE e depois INSERT porque o objeto foi criado pela API de metadata,
    // que não cria índice único — então não há em que apoiar um ON CONFLICT.
    upsertForContract: async (contractId, invoices) => {
      for (const fatura of invoices) {
        const valores = [
          contractId,
          fatura.externalInvoiceId,
          fatura.code ?? fatura.externalInvoiceId,
          fatura.status,
          fatura.amount.amountMicros,
          fatura.amount.currencyCode || DEFAULT_CURRENCY_CODE,
          fatura.dueAt,
          fatura.paidAt,
          fatura.paymentUrl,
        ];

        const atualizada = await client.query(
          `UPDATE ${faturas} SET
             "name" = $3,
             "invoiceStatus" = $4,
             "amountAmountMicros" = $5,
             "amountCurrencyCode" = $6,
             "dueAt" = $7::timestamptz,
             "paidAt" = $8::timestamptz,
             "paymentUrlPrimaryLinkUrl" = $9,
             "updatedAt" = now()
           WHERE ${colContrato} = $1
             AND "externalInvoiceId" = $2
             AND "deletedAt" IS NULL`,
          valores,
        );

        if ((atualizada.rowCount ?? 0) > 0) {
          continue;
        }

        await client.query(
          `INSERT INTO ${faturas}
             (${colContrato}, "externalInvoiceId", "name", "invoiceStatus",
              "amountAmountMicros", "amountCurrencyCode",
              "dueAt", "paidAt", "paymentUrlPrimaryLinkUrl")
           VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9)`,
          valores,
        );
      }
    },

    // Soma no banco, não na tela: um clube com anos de histórico traria centenas
    // de faturas só para o painel mostrar dois totais.
    summarizeForContracts: async (contractIds): Promise<InvoiceSummary> => {
      if (contractIds.length === 0) {
        return {
          openAmount: { amountMicros: 0, currencyCode: DEFAULT_CURRENCY_CODE },
          paidAmount: { amountMicros: 0, currencyCode: DEFAULT_CURRENCY_CODE },
          openCount: 0,
          paidCount: 0,
          nextDueAt: null,
        };
      }

      const { rows } = await client.query<{
        openAmount: string | null;
        paidAmount: string | null;
        openCount: string;
        paidCount: string;
        nextDueAt: Date | null;
        currencyCode: string | null;
      }>(
        `SELECT
           COALESCE(SUM("amountAmountMicros") FILTER (WHERE "invoiceStatus" <> ALL($2)), 0) AS "openAmount",
           COALESCE(SUM("amountAmountMicros") FILTER (WHERE "invoiceStatus" = ANY($2)), 0) AS "paidAmount",
           COUNT(*) FILTER (WHERE "invoiceStatus" <> ALL($2)) AS "openCount",
           COUNT(*) FILTER (WHERE "invoiceStatus" = ANY($2)) AS "paidCount",
           MIN("dueAt") FILTER (WHERE "invoiceStatus" <> ALL($2)) AS "nextDueAt",
           MIN("amountCurrencyCode") AS "currencyCode"
         FROM ${faturas}
         WHERE ${colContrato} = ANY($1::uuid[]) AND "deletedAt" IS NULL`,
        [contractIds, PAGAS],
      );

      const linha = rows[0];
      const moeda = linha?.currencyCode ?? DEFAULT_CURRENCY_CODE;

      return {
        openAmount: {
          amountMicros: Number(linha?.openAmount ?? 0),
          currencyCode: moeda,
        },
        paidAmount: {
          amountMicros: Number(linha?.paidAmount ?? 0),
          currencyCode: moeda,
        },
        openCount: Number(linha?.openCount ?? 0),
        paidCount: Number(linha?.paidCount ?? 0),
        nextDueAt: linha?.nextDueAt?.toISOString() ?? null,
      };
    },
  };
};
