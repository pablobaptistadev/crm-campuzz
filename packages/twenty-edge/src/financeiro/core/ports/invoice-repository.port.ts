import { type GatewayInvoice } from 'src/financeiro/core/domain/entities/gateway-contract.entity';
import { type Money } from 'src/financeiro/core/domain/value-objects/money.value-object';

export type InvoiceSummary = {
  openAmount: Money;
  paidAmount: Money;
  openCount: number;
  paidCount: number;
  /** O vencimento em aberto mais proximo, ou null se nao ha nada a pagar. */
  nextDueAt: string | null;
};

export type InvoiceRepositoryPort = {
  /**
   * Grava as faturas do contrato, casando por `externalInvoiceId`.
   *
   * Idempotente de proposito: o webhook e o cron cobrem o mesmo dado, e sem isso
   * a segunda passada duplicaria a parcela na aba do financeiro.
   */
  upsertForContract(
    contractId: string,
    invoices: readonly GatewayInvoice[],
  ): Promise<void>;

  /**
   * Os totais que o painel do registro mostra.
   *
   * Some no repositorio, nao na tela: o painel sabe somar, mas nao deveria
   * precisar carregar todas as faturas para isso — e um clube com anos de
   * historico traria centenas.
   */
  summarizeForContracts(
    contractIds: readonly string[],
  ): Promise<InvoiceSummary>;
};
