import {
  type ContractFrequency,
  type GatewayContract,
  type GatewayInvoice,
} from 'src/core/domain/entities/gateway-contract.entity';
import {
  moneyFromUnits,
  sumMoney,
} from 'src/core/domain/value-objects/money.value-object';
import {
  type RouterfyInvoicePayload,
  type RouterfySubscriptionPayload,
  type RouterfyTransactionPayload,
} from 'src/infrastructure/gateways/routerfy/routerfy-payload.types';

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
  status: text(payload.status) ?? 'pending',
  amount: moneyFromUnits(payload.amount ?? 0),
  dueAt: text(payload.dueAt),
  paidAt: text(payload.paidAt),
  paymentUrl: text(payload.paymentUrl),
});

export const mapSubscription = (
  payload: RouterfySubscriptionPayload,
): GatewayContract => {
  const invoices = (payload.invoices ?? []).map(mapInvoice);

  return {
    kind: 'SUBSCRIPTION',
    subscriptionId: text(payload.id),
    transactionId: null,
    code: text(payload.code),
    status: text(payload.status) ?? 'unknown',
    amount: moneyFromUnits(payload.amount ?? 0),
    frequency: frequencyFrom(payload.frequency),
    frequencyInterval: payload.interval ?? null,
    startsAt: text(payload.startsAt),
    endsAt: text(payload.endsAt),
    nextChargeAt: text(payload.nextAt),
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
  const amount = moneyFromUnits(payload.total ?? payload.amount ?? 0);

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
        status: text(payload.status) ?? 'pending',
        amount,
        dueAt: text(payload.createdAt),
        paidAt: text(payload.paidAt),
        paymentUrl: text(payload.paymentUrl),
      },
    ],
  };
};

/**
 * Total do contrato pela soma das faturas.
 *
 * Mais fiel que `parcela x numero de parcelas` porque desconto e acrescimo so
 * aparecem na fatura. Sem faturas, cai no valor do contrato. Mesma regra do
 * `summarize` em api/src/signature/contractFinance.ts.
 */
export const totalValueOf = (contract: GatewayContract) =>
  contract.invoices.length > 0
    ? sumMoney(contract.invoices.map((invoice) => invoice.amount))
    : contract.amount;
