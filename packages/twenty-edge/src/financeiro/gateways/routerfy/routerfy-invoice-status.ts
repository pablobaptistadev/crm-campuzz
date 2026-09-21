import { type InvoiceStatus } from 'src/financeiro/core/domain/entities/gateway-contract.entity';

/**
 * Traducao da situacao da fatura, da Routerfy para o dominio.
 *
 * Os valores da esquerda foram lidos da API de producao, nao deduzidos: uma
 * varredura das assinaturas e transacoes da conta devolveu `paid`, `scheduled`,
 * `canceled`, `pending`, `waiting_payment` e `refused`. As demais entradas sao
 * as variantes que a mesma API ja usou em outros lugares (`cancelled` com dois
 * `l`, `overdue`, `expired`), baratas de aceitar e caras de descobrir faltando.
 */
const NO_DOMINIO: Record<string, InvoiceStatus> = {
  paid: 'PAID',
  // Parcela futura, ainda nao cobrada: nao e divida hoje. Quem decide se
  // atrasou e a data de vencimento, entao PENDING basta e nao mente.
  scheduled: 'PENDING',
  pending: 'PENDING',
  processing: 'PENDING',
  waiting_payment: 'WAITING_PAYMENT',
  // Cobranca tentada e recusada: o dinheiro nao entrou e a data ja passou.
  // Chamar de PENDING esconderia justamente o cliente que precisa ser cobrado.
  refused: 'OVERDUE',
  failed: 'OVERDUE',
  overdue: 'OVERDUE',
  expired: 'EXPIRED',
  canceled: 'CANCELED',
  cancelled: 'CANCELED',
  refunded: 'CANCELED',
  chargeback: 'CANCELED',
};

/**
 * Situacao desconhecida vira PENDING de proposito.
 *
 * As outras saidas sao piores: PAID esconderia uma divida real, e estourar
 * devolve a tela o `Internal Server Error` que essa traducao existe para
 * acabar. PENDING deixa a fatura visivel e entrega a decisao a data de
 * vencimento, que e onde ela ja estava.
 */
export const situacaoDaFatura = (
  status: string | undefined | null,
): InvoiceStatus => NO_DOMINIO[(status ?? '').trim().toLowerCase()] ?? 'PENDING';
