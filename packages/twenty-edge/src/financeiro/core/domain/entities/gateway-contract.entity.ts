import {
  type InvoiceStatus,
  isInvoiceCanceled,
  isInvoicePaid,
} from 'src/financeiro/core/domain/value-objects/invoice-status.value-object';
import {
  type Money,
  sumMoney,
} from 'src/financeiro/core/domain/value-objects/money.value-object';

/**
 * O contrato como o dominio o enxerga, ja independente do gateway que o leu.
 *
 * `subscriptionId` e `transactionId` sao separados de proposito: no gateway,
 * recorrencia e venda a vista sao objetos diferentes com ids diferentes, e
 * misturar os dois na mesma coluna foi o que quebrou a tela do financeiro no
 * Campuzz (ver api/src/service/routerfyIds.ts).
 */
export type ContractKind = 'SUBSCRIPTION' | 'TRANSACTION';

export type ContractFrequency = 'day' | 'week' | 'month' | 'year';

export type GatewayCustomer = {
  name: string | null;
  email: string | null;
  document: string | null;
  phone: string | null;
};

export type GatewayInvoice = {
  externalInvoiceId: string;
  code: string | null;
  status: InvoiceStatus;
  amount: Money;
  dueAt: string | null;
  paidAt: string | null;
  paymentUrl: string | null;
};

export type GatewayContract = {
  kind: ContractKind;
  subscriptionId: string | null;
  transactionId: string | null;
  code: string | null;
  status: string;
  amount: Money;
  frequency: ContractFrequency | null;
  frequencyInterval: number | null;
  startsAt: string | null;
  endsAt: string | null;
  nextChargeAt: string | null;
  paymentMethod: string | null;
  customer: GatewayCustomer;
  invoices: readonly GatewayInvoice[];
};

/** A quem o contrato pertence no CRM. Um ou o outro, nunca os dois. */
export type ContractHolder =
  | { type: 'COMPANY'; recordId: string }
  | { type: 'PERSON'; recordId: string };

export type StoredContract = {
  id: string;
  externalSubscriptionId: string | null;
  externalTransactionId: string | null;
  businessUnitId: string;
  holder: ContractHolder;
};

export const countsTowardTotal = (invoice: GatewayInvoice): boolean =>
  !isInvoiceCanceled(invoice.status);

/**
 * Total do contrato pela soma das faturas.
 *
 * Mais fiel que `parcela x numero de parcelas` porque desconto e acrescimo so
 * aparecem na fatura. Sem faturas, cai no valor do contrato. Mesma regra do
 * `summarize` em api/src/signature/contractFinance.ts.
 */
export const totalValueOf = (contract: GatewayContract): Money => {
  const contam = contract.invoices.filter(countsTowardTotal);

  return contam.length > 0
    ? sumMoney(contam.map((invoice) => invoice.amount))
    : contract.amount;
};

export const paidInvoiceCountOf = (contract: GatewayContract): number =>
  contract.invoices.filter((invoice) => isInvoicePaid(invoice.status)).length;
