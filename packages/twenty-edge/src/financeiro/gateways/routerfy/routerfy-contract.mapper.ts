import {
  type ContractFrequency,
  countsTowardTotal,
  type GatewayContract,
  type GatewayInvoice,
} from 'src/financeiro/core/domain/entities/gateway-contract.entity';
import { invoiceStatusFromGateway } from 'src/financeiro/core/domain/value-objects/invoice-status.value-object';
import { moneyFromCents } from 'src/financeiro/core/domain/value-objects/money.value-object';
import {
  type RouterfyInvoicePayload,
  type RouterfySubscriptionPayload,
  type RouterfyTransactionPayload,
} from 'src/financeiro/gateways/routerfy/routerfy-payload.types';

/**
 * Traducao do metodo de pagamento, igual a do admin do Campuzz.
 *
 * Copiada de api/src/signature/contractFinance.ts para o CRM e o admin nao
 * chamarem a mesma coisa por nomes diferentes na frente do mesmo cliente.
 */
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  credit_card: 'Cartao de credito',
  boleto: 'Boleto bancario',
  bank_slip: 'Boleto bancario',
  pix: 'PIX',
};

const FREQUENCIES: readonly ContractFrequency[] = [
  'day',
  'week',
  'month',
  'year',
];

const text = (value: string | undefined): string | null => {
  const trimmed = value?.trim() ?? '';

  return trimmed.length > 0 ? trimmed : null;
};

const frequencyFrom = (value: string | undefined): ContractFrequency | null => {
  const normalized = value?.trim().toLowerCase() ?? '';

  return (
    FREQUENCIES.find((candidate) => candidate === normalized) ?? null
  );
};

const paymentMethodLabel = (value: string | undefined): string | null => {
  const raw = text(value);

  if (raw === null) {
    return null;
  }

  return PAYMENT_METHOD_LABEL[raw] ?? raw;
};

const mapInvoice = (
  payload: RouterfyInvoicePayload,
  index: number,
): GatewayInvoice => ({
  // Sem id o registro nao tem chave de idempotencia. Cair no code, e so entao no
  // indice, mantem a fatura visivel em vez de perde-la — e duas passadas do sync
  // continuam casando na mesma linha.
  externalInvoiceId:
    text(payload.id) ?? text(payload.code) ?? `sem-id-${index}`,
  code: text(payload.code),
  status: invoiceStatusFromGateway(payload.status ?? ''),
  amount: moneyFromCents(payload.amount ?? 0),
  dueAt: text(payload.dueAt),
  paidAt: text(payload.paidAt),
  paymentUrl: text(payload.paymentUrl),
});

// A Routerfy nao manda a data da proxima cobranca na assinatura. O vencimento em
// aberto mais proximo e a mesma informacao, e deixar em branco esconderia do
// painel a data que todo mundo procura primeiro.
const proximaCobranca = (invoices: readonly GatewayInvoice[]): string | null => {
  const abertas = invoices
    .filter(
      (invoice) =>
        countsTowardTotal(invoice) &&
        invoice.status !== 'PAID' &&
        invoice.dueAt !== null,
    )
    .map((invoice) => invoice.dueAt as string)
    .sort();

  return abertas[0] ?? null;
};

export const mapSubscription = (
  payload: RouterfySubscriptionPayload,
): GatewayContract => {
  const invoices = (payload.invoices ?? []).map(mapInvoice);

  // A assinatura nao traz `amount` no topo: o valor da cobranca e a soma dos
  // itens. Ler o campo que nao existe dava R$ 0 num contrato de R$ 547 por mes.
  const valorDaCobranca = (payload.items ?? []).reduce(
    (total, item) => total + (item.amount ?? 0),
    0,
  );

  return {
    kind: 'SUBSCRIPTION',
    subscriptionId: text(payload.id),
    transactionId: null,
    code: text(payload.code),
    status: text(payload.status) ?? 'unknown',
    amount: moneyFromCents(payload.amount ?? valorDaCobranca),
    frequency: frequencyFrom(payload.frequency),
    frequencyInterval: payload.interval ?? null,
    startsAt: text(payload.startsAt),
    endsAt: text(payload.endsAt),
    nextChargeAt: text(payload.nextAt) ?? proximaCobranca(invoices),
    paymentMethod: paymentMethodLabel(payload.paymentMethods?.[0]?.paymentMethod),
    customer: {
      name: text(payload.customer?.name),
      email: text(payload.customer?.email),
      document: text(payload.customer?.document),
      phone: text(payload.customer?.phone),
    },
    invoices,
  };
};

export const mapTransaction = (
  payload: RouterfyTransactionPayload,
): GatewayContract => {
  const amount = moneyFromCents(payload.total ?? payload.amount ?? 0);

  return {
    kind: 'TRANSACTION',
    subscriptionId: null,
    transactionId: text(payload.id),
    code: text(payload.code),
    status: text(payload.status) ?? 'unknown',
    amount,
    frequency: null,
    frequencyInterval: null,
    startsAt: text(payload.createdAt),
    endsAt: null,
    nextChargeAt: null,
    paymentMethod: paymentMethodLabel(payload.paymentMethod),
    customer: {
      name: text(payload.customer?.name),
      email: text(payload.customer?.email),
      document: text(payload.customer?.document),
      phone: text(payload.customer?.phone),
    },
    // Venda a vista nao tem lista de faturas na Routerfy. Sintetizamos uma para a
    // aba do financeiro nao ficar vazia num contrato que tem, sim, uma cobranca.
    invoices: [
      {
        externalInvoiceId: text(payload.id) ?? 'transacao-sem-id',
        code: text(payload.code),
        status: invoiceStatusFromGateway(payload.status ?? ''),
        amount,
        dueAt: text(payload.createdAt),
        paidAt: text(payload.paidAt),
        paymentUrl: text(payload.paymentUrl),
      },
    ],
  };
};
