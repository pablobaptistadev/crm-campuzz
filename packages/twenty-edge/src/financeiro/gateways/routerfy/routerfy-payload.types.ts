/**
 * O que a Routerfy devolve, como ela devolve.
 *
 * Tudo opcional de proposito: nao ha fixture nem contrato publicado da API em
 * lugar nenhum — o formato esta documentado apenas pelo que o codigo do Campuzz
 * assume. Declarar campo obrigatorio aqui seria afirmar o que nao sabemos, e o
 * primeiro payload diferente viraria excecao em vez de campo vazio.
 */
export type RouterfyCustomerPayload = {
  id?: string;
  name?: string;
  email?: string;
  document?: string;
  phone?: string;
};

export type RouterfyPaymentMethodPayload = {
  paymentMethod?: string;
};

export type RouterfyInvoicePayload = {
  id?: string;
  code?: string;
  status?: string;
  amount?: number;
  dueAt?: string;
  paidAt?: string;
  paymentUrl?: string;
  subscriptionId?: string;
};

export type RouterfySubscriptionPayload = {
  id?: string;
  code?: string;
  status?: string;
  amount?: number;
  frequency?: string;
  interval?: number;
  startsAt?: string;
  endsAt?: string;
  nextAt?: string;
  paidInvoices?: number;
  // O nome que a Routerfy usa de verdade; paidInvoices nunca veio preenchido.
  paidChargesQuantity?: number;
  totalChargesQuantity?: number;
  // O valor da cobranca mora aqui, nao no topo da assinatura.
  items?: { amount?: number; name?: string; code?: string }[];
  customer?: RouterfyCustomerPayload;
  paymentMethods?: RouterfyPaymentMethodPayload[];
  invoices?: RouterfyInvoicePayload[];
};

export type RouterfyTransactionPayload = {
  id?: string;
  code?: string;
  status?: string;
  amount?: number;
  total?: number;
  paidAt?: string;
  createdAt?: string;
  paymentUrl?: string;
  paymentMethod?: string;
  customer?: RouterfyCustomerPayload;
};

/**
 * A Routerfy responde lista ora como `{data: []}`, ora como array cru.
 *
 * Nao e suposicao: `enrollment.service.ts:175` no Campuzz ja trata os dois casos
 * — `Array.isArray(list) ? list : list?.data ?? []`. Aceitar so um formato
 * quebraria em producao no dia em que a API voltasse para o outro.
 */
export type RouterfyListPayload<TItem> = TItem[] | { data?: TItem[] };

export const unwrapList = <TItem>(
  payload: RouterfyListPayload<TItem> | null,
): TItem[] => {
  if (payload === null) {
    return [];
  }

  return Array.isArray(payload) ? payload : (payload.data ?? []);
};
