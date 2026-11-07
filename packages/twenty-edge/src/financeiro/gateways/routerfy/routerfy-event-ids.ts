import { type GatewayEventEnvelope } from 'src/financeiro/core/use-cases/apply-gateway-event.use-case';

/**
 * De onde saem o id do contrato e o id da transacao num webhook da Routerfy.
 *
 * Portado de api/src/service/routerfyIds.ts, e a razao de existir vale repetir:
 * no Campuzz havia um jeito por chamada. Um lugar lia a transacao em
 * `data.transactionId`, outro lia no MESMO evento em `data.id`, e um terceiro
 * gravava `data.id` na coluna do CONTRATO sem olhar o evento. Um id de transacao
 * ia parar onde o financeiro procura assinatura, e a tela do aluno ficava sem
 * dado nenhum.
 *
 * A regra e por TIPO, nunca por posicao no payload:
 *
 *   um campo chamado `subscriptionId` so pode significar uma coisa. Onde ele
 *   existir — na raiz, nos itens ou nas faturas — ele manda, porque e a unica
 *   leitura que nao depende de adivinhar o formato do evento.
 *
 * Sem ele, `data.id` vale conforme a familia do evento:
 *   `subscription.*`  o objeto e a assinatura, entao `data.id` e o contrato
 *   `transaction.*`   o objeto e a transacao, e a coluna do contrato NAO recebe nada
 */
export type RouterfyWebhookBody = {
  event?: string;
  id?: string;
  data?: Record<string, unknown>;
};

const text = (value: unknown): string | null => {
  const raw =
    typeof value === 'string'
      ? value.trim()
      : typeof value === 'number'
        ? String(value)
        : '';

  return raw.length > 0 ? raw : null;
};

const asRecordArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null,
      )
    : [];

/**
 * O primeiro `subscriptionId` declarado no payload, onde quer que esteja.
 *
 * Faturas e itens de uma mesma assinatura apontam todos para ela, entao o
 * primeiro serve.
 */
const declaredSubscriptionId = (
  data: Record<string, unknown>,
): string | null => {
  const direct = text(data.subscriptionId);

  if (direct !== null) {
    return direct;
  }

  for (const key of ['items', 'invoices']) {
    for (const entry of asRecordArray(data[key])) {
      const nested = text(entry.subscriptionId);

      if (nested !== null) {
        return nested;
      }
    }
  }

  return null;
};

export const extractEventEnvelope = (
  body: RouterfyWebhookBody,
  fallbackEventId: string,
): GatewayEventEnvelope => {
  const data = body.data ?? {};
  const eventName = text(body.event) ?? '';
  const eventId = text(body.id) ?? fallbackEventId;

  const declared = declaredSubscriptionId(data);
  const objectId = text(data.id);

  if (declared !== null) {
    return {
      eventId,
      subscriptionId: declared,
      transactionId: eventName.startsWith('transaction.') ? objectId : null,
    };
  }

  if (eventName.startsWith('subscription.')) {
    return { eventId, subscriptionId: objectId, transactionId: null };
  }

  if (eventName.startsWith('transaction.')) {
    return { eventId, subscriptionId: null, transactionId: objectId };
  }

  // Evento de familia desconhecida: nao adivinhamos de que lado o id cai. Sem
  // identificador, o caso de uso ignora em vez de gravar no lugar errado.
  return { eventId, subscriptionId: null, transactionId: null };
};
