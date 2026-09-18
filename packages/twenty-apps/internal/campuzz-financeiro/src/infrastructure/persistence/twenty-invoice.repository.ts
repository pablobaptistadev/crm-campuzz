import { type GatewayInvoice } from 'src/core/domain/entities/gateway-contract.entity';
import {
  type InvoiceStatus,
  invoiceStatusFromGateway,
  isInvoiceOpen,
  isInvoicePaid,
} from 'src/core/domain/value-objects/invoice-status.value-object';
import {
  DEFAULT_CURRENCY_CODE,
  type Money,
} from 'src/core/domain/value-objects/money.value-object';
import {
  type InvoiceRepositoryPort,
  type InvoiceSummary,
} from 'src/core/ports/invoice-repository.port';
import {
  allNodes,
  type Connection,
  type ReadWriteClient,
} from 'src/infrastructure/persistence/record-shapes';

const PAGE_SIZE = 200;

type InvoiceRecord = {
  id: string;
  externalInvoiceId: string | null;
};

type InvoiceSummaryRecord = {
  invoiceStatus: string | null;
  amount: { amountMicros: number | null; currencyCode: string | null } | null;
  dueAt: string | null;
};

const EMPTY_SUMMARY: InvoiceSummary = {
  openAmount: { amountMicros: 0, currencyCode: DEFAULT_CURRENCY_CODE },
  paidAmount: { amountMicros: 0, currencyCode: DEFAULT_CURRENCY_CODE },
  openCount: 0,
  paidCount: 0,
  nextDueAt: null,
};

const invoiceData = (invoice: GatewayInvoice) => ({
  name: invoice.code ?? invoice.externalInvoiceId,
  externalInvoiceId: invoice.externalInvoiceId,
  invoiceStatus: invoiceStatusFromGateway(invoice.status),
  amount: invoice.amount,
  dueAt: invoice.dueAt,
  paidAt: invoice.paidAt,
  paymentUrl:
    invoice.paymentUrl === null
      ? null
      : { primaryLinkUrl: invoice.paymentUrl, primaryLinkLabel: 'Pagar' },
});

export class TwentyInvoiceRepository implements InvoiceRepositoryPort {
  constructor(private readonly client: ReadWriteClient) {}

  /**
   * Grava as faturas do contrato casando por `externalInvoiceId`.
   *
   * Idempotente porque tres caminhos escrevem a mesma fatura: o vinculo inicial,
   * o webhook e o cron. Sem o casamento por id externo, a aba do financeiro
   * mostraria a mesma parcela tres vezes — e ninguem saberia qual e a boa.
   *
   * Faturas que sumiram do gateway ficam como estao: podem ter sido canceladas
   * la, e apagar historico de cobranca por inferencia e pior que manter uma
   * linha a mais.
   */
  async upsertForContract(
    contractId: string,
    invoices: readonly GatewayInvoice[],
  ): Promise<void> {
    if (invoices.length === 0) {
      return;
    }

    const existing: { gatewayInvoices?: Connection<InvoiceRecord> } =
      await this.client.query({
        gatewayInvoices: {
          __args: {
            filter: { gatewayContractId: { eq: contractId } },
            first: PAGE_SIZE,
          },
          edges: { node: { id: true, externalInvoiceId: true } },
        },
      });

    const idByExternalId = new Map(
      allNodes(existing.gatewayInvoices)
        .filter((record) => record.externalInvoiceId !== null)
        .map((record) => [record.externalInvoiceId as string, record.id]),
    );

    for (const invoice of invoices) {
      const recordId = idByExternalId.get(invoice.externalInvoiceId);

      if (recordId === undefined) {
        await this.client.mutation({
          createGatewayInvoice: {
            __args: {
              data: { ...invoiceData(invoice), gatewayContractId: contractId },
            },
            id: true,
          },
        });

        continue;
      }

      await this.client.mutation({
        updateGatewayInvoice: {
          __args: { id: recordId, data: invoiceData(invoice) },
          id: true,
        },
      });
    }
  }

  async summarizeForContracts(
    contractIds: readonly string[],
  ): Promise<InvoiceSummary> {
    if (contractIds.length === 0) {
      return EMPTY_SUMMARY;
    }

    const result: { gatewayInvoices?: Connection<InvoiceSummaryRecord> } =
      await this.client.query({
        gatewayInvoices: {
          __args: {
            filter: { gatewayContractId: { in: [...contractIds] } },
            first: PAGE_SIZE,
          },
          edges: {
            node: {
              invoiceStatus: true,
              amount: { amountMicros: true, currencyCode: true },
              dueAt: true,
            },
          },
        },
      });

    let openMicros = 0;
    let paidMicros = 0;
    let openCount = 0;
    let paidCount = 0;
    let nextDueAt: string | null = null;
    let currencyCode = DEFAULT_CURRENCY_CODE;

    for (const record of allNodes(result.gatewayInvoices)) {
      const status = (record.invoiceStatus ?? 'PENDING') as InvoiceStatus;
      const micros = record.amount?.amountMicros ?? 0;

      currencyCode = record.amount?.currencyCode ?? currencyCode;

      if (isInvoicePaid(status)) {
        paidMicros += micros;
        paidCount += 1;
        continue;
      }

      if (!isInvoiceOpen(status)) {
        // Cancelada ou expirada nao e divida nem receita: fica de fora dos dois
        // totais em vez de inflar um deles.
        continue;
      }

      openMicros += micros;
      openCount += 1;

      if (
        record.dueAt !== null &&
        (nextDueAt === null || record.dueAt < nextDueAt)
      ) {
        nextDueAt = record.dueAt;
      }
    }

    const money = (amountMicros: number): Money => ({
      amountMicros,
      currencyCode,
    });

    return {
      openAmount: money(openMicros),
      paidAmount: money(paidMicros),
      openCount,
      paidCount,
      nextDueAt,
    };
  }
}
