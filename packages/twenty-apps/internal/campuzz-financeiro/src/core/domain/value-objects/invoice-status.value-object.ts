/**
 * Situacao de uma fatura, e de que lado do financeiro ela cai.
 *
 * Os valores sao os que a Routerfy manda; a traducao para portugues veio de
 * admin-front/src/pages/private/Classes/pages/Members/utils.ts, para o CRM e o
 * admin nao terem dois vocabularios para a mesma coisa.
 */
export const INVOICE_STATUSES = [
  'PAID',
  'PENDING',
  'WAITING_PAYMENT',
  'OVERDUE',
  'EXPIRED',
  'CANCELED',
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

const STATUS_BY_GATEWAY_VALUE: Record<string, InvoiceStatus> = {
  paid: 'PAID',
  pending: 'PENDING',
  waiting_payment: 'WAITING_PAYMENT',
  late: 'OVERDUE',
  overdue: 'OVERDUE',
  expired: 'EXPIRED',
  canceled: 'CANCELED',
  cancelled: 'CANCELED',
  refunded: 'CANCELED',
};

/** Status desconhecido vira PENDING: aparece como a pagar em vez de sumir da tela. */
export const invoiceStatusFromGateway = (value: string): InvoiceStatus =>
  STATUS_BY_GATEWAY_VALUE[value.trim().toLowerCase()] ?? 'PENDING';

const OPEN_STATUSES: readonly InvoiceStatus[] = [
  'PENDING',
  'WAITING_PAYMENT',
  'OVERDUE',
];

export const isInvoiceOpen = (status: InvoiceStatus): boolean =>
  OPEN_STATUSES.includes(status);

export const isInvoicePaid = (status: InvoiceStatus): boolean =>
  status === 'PAID';
