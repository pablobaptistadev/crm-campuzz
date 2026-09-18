import { LOGIC_FUNCTIONS } from 'src/twenty/constants/universal-identifiers';

const SERVER_URL_ENV_VAR_NAME = 'SERVER_URL';

/**
 * A URL publica que registramos no gateway.
 *
 * O caminho nao e escolhido por nos: o Twenty expoe todo resolver de rota em
 * `/webhooks/server/<universalIdentifier do resolver>` (ver
 * `server-route-trigger.controller.ts`). O que e nosso e o `registrationId` na
 * query string — e ele e o unico separador entre uma entrega legitima e um POST
 * de quem descobriu a rota, ja que a Routerfy nao assina as entregas. Por isso
 * ele e um UUID, e por isso o alvo ainda rele tudo na API antes de aplicar.
 */
export const buildWebhookUrl = (registrationId: string): string => {
  const base = (process.env[SERVER_URL_ENV_VAR_NAME] ?? '').replace(/\/+$/, '');

  return `${base}/webhooks/server/${LOGIC_FUNCTIONS.webhookResolver}?registrationId=${encodeURIComponent(registrationId)}`;
};
