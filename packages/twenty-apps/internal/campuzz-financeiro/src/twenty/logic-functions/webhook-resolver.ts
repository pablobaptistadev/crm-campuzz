import {
  defineLogicFunction,
  type RoutePayload,
  type ServerRouteResolverResult,
} from 'twenty-sdk/define';
import { Response } from 'twenty-sdk/logic-function';

import { KvWebhookRegistry } from 'src/infrastructure/vault/kv-webhook-registry';
import { LOGIC_FUNCTIONS } from 'src/twenty/constants/universal-identifiers';

/**
 * A porta de entrada dos eventos do gateway — e o unico ponto de autorizacao.
 *
 * Roda sem contexto de workspace: a URL so carrega o `registrationId`, e e por
 * ele que descobrimos para qual workspace e para qual BU despachar. Um
 * `registrationId` desconhecido morre aqui com 404 e nao entra.
 *
 * **Cada BU tem o seu `registrationId`, entao cada BU e o seu proprio bus.** Se
 * clube e alunos compartilham a BU, compartilham o bus; se tem BUs diferentes, os
 * eventos chegam por caminhos distintos e nunca se misturam. A separacao e
 * consequencia da configuracao, nao de rota hardcoded.
 */
export const webhookResolverHandler = async (
  routePayload: RoutePayload<unknown>,
): Promise<ServerRouteResolverResult> => {
  const registrationId = routePayload.queryStringParameters?.registrationId;

  if (typeof registrationId !== 'string' || registrationId.trim().length === 0) {
    return new Response(
      { error: 'Missing registration identifier' },
      { status: 400 },
    );
  }

  const claim = await new KvWebhookRegistry().resolve(registrationId);

  if (claim === null) {
    return new Response({ error: 'Unknown registration' }, { status: 404 });
  }

  return {
    workspaceId: claim.workspaceId,
    targetLogicFunctionUniversalIdentifier: LOGIC_FUNCTIONS.webhookTarget,
    payload: { routePayload, businessUnitId: claim.businessUnitId },
  };
};

export default defineLogicFunction({
  universalIdentifier: LOGIC_FUNCTIONS.webhookResolver,
  name: 'campuzz-financeiro-webhook-resolver',
  description:
    'Descobre a qual workspace e a qual BU pertence a entrega e despacha o evento.',
  timeoutSeconds: 15,
  handler: webhookResolverHandler,
  serverRouteTriggerSettings: { httpMethods: ['POST'] },
});
