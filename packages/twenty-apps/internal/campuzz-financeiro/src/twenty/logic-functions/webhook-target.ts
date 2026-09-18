import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';

import { applyGatewayEvent } from 'src/core/use-cases/apply-gateway-event.use-case';
import { buildContainer } from 'src/infrastructure/container';
import {
  extractEventEnvelope,
  type RouterfyWebhookBody,
} from 'src/infrastructure/gateways/routerfy/routerfy-event-ids';
import { LOGIC_FUNCTIONS } from 'src/twenty/constants/universal-identifiers';

/**
 * Aplica o evento — relendo a verdade na API do gateway.
 *
 * A Routerfy nao assina as entregas. O corpo que chega aqui e um aviso de que
 * algo mudou, nao um dado confiavel: dele usamos apenas o id do evento (para nao
 * aplicar duas vezes) e os ids que dizem QUAL contrato mexeu. Valor, status e
 * datas saem da releitura feita com as chaves da propria BU.
 *
 * Nunca lanca. Um evento que nao da para aplicar vira resposta com motivo — o
 * gateway nao tem o que fazer com um 500 nosso, e um retry infinito por causa de
 * contrato desconhecido so gastaria chamada dos dois lados.
 */
export const webhookTargetHandler = async ({
  routePayload,
  businessUnitId,
}: {
  routePayload: RoutePayload<unknown>;
  businessUnitId: string;
}) => {
  const body = (routePayload.body ?? {}) as RouterfyWebhookBody;

  // Sem id de evento no payload, o par (BU, contrato) e o melhor discriminador
  // que temos. Nao e perfeito, mas evita que a falta do campo desligue a dedup.
  const fallbackEventId = `${businessUnitId}:${JSON.stringify(body.data ?? {}).slice(0, 200)}`;

  const event = extractEventEnvelope(body, fallbackEventId);
  const container = buildContainer();

  try {
    const outcome = await applyGatewayEvent(container, {
      businessUnitId,
      event,
    });

    return { success: true, ...outcome };
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        scope: 'campuzz-financeiro.webhook',
        businessUnitId,
        eventId: event.eventId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );

    return { success: false, applied: false, reason: 'ERROR' };
  }
};

export default defineLogicFunction({
  universalIdentifier: LOGIC_FUNCTIONS.webhookTarget,
  name: 'campuzz-financeiro-webhook',
  description:
    'Rele o contrato no gateway e atualiza contrato e faturas. Ignora reentrega do mesmo evento.',
  timeoutSeconds: 300,
  handler: webhookTargetHandler,
});
