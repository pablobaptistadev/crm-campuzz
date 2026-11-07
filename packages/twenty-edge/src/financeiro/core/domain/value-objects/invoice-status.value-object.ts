/**
 * Situacao de uma fatura, e de que lado do financeiro ela cai.
 *
 * Estes seis sao as opcoes do SELECT `invoiceStatus`; a traducao para portugues
 * veio de admin-front/src/pages/private/Classes/pages/Members/utils.ts, para o
 * CRM e o admin nao terem dois vocabularios para a mesma coisa.
 *
 * Gravar o texto cru do gateway aqui derrubava a vinculacao inteira com
 * `invalid input value for enum ... "paid"`, e por isso nenhum contrato chegou
 * a ser gravado. Quem le o gateway traduz por `invoiceStatusFromGateway`;
 * daqui para dentro ha um vocabulario so.
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
  // As quatro abaixo sairam de uma varredura da API de producao. `scheduled`
  // sozinho responde por 55 das 76 faturas da conta, e sem ele toda parcela
  // futura caia no fallback — certo por acidente, e mudo sobre o porque.
  scheduled: 'PENDING',
  processing: 'PENDING',
  // Cobranca tentada e recusada: o dinheiro nao entrou e a data ja passou.
  // Chamar de PENDING esconderia justamente o cliente que precisa ser cobrado.
  refused: 'OVERDUE',
  failed: 'OVERDUE',
  chargeback: 'CANCELED',
};

/**
 * Status desconhecido vira PENDING: aparece como a pagar em vez de sumir da
 * tela. As outras saidas sao piores — PAID esconderia uma divida real, e
 * estourar devolveria a tela o `Internal Server Error` que essa traducao existe
 * para acabar. A data de vencimento continua decidindo se atrasou.
 */
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

// Fatura cancelada continua na lista do gateway, com valor, e nao e divida:
// somar as duas canceladas de um contrato dava R$ 8.205 num contrato de
// R$ 7.111. Conferido contra o painel da assinatura 2026071000000304.
export const isInvoiceCanceled = (status: InvoiceStatus): boolean =>
  status === 'CANCELED';
