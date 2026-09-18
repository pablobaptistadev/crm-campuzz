import { LOGIC_FUNCTIONS } from 'src/twenty/constants/universal-identifiers';

/**
 * A URL publica que registramos no gateway.
 *
 * Duas coisas aqui nao sao escolha nossa:
 *
 * 1. **O nome da variavel.** A base publica do servidor chega na logic function
 *    como `TWENTY_API_URL`, nao como `SERVER_URL`. Quem monta esse ambiente e
 *    `logic-function-executor.service.ts`, que faz
 *    `[DEFAULT_API_URL_NAME]: cleanServerUrl(config.get('SERVER_URL'))` — ou
 *    seja, o valor vem do `SERVER_URL` do servidor, mas e exposto sob outro
 *    nome. Ler `SERVER_URL` aqui devolve `undefined`, e a URL registrada no
 *    gateway nasceria relativa: entrega nenhuma, e sem erro visivel.
 *
 * 2. **O caminho.** O Twenty expoe todo resolver de rota em
 *    `/webhooks/server/<universalIdentifier do resolver>`
 *    (`server-route-trigger.controller.ts`).
 *
 * O que e nosso e o `registrationId` na query string — e ele e o unico separador
 * entre uma entrega legitima e um POST de quem descobriu a rota, ja que a
 * Routerfy nao assina as entregas. Por isso ele e um UUID, e por isso o alvo
 * ainda rele tudo na API antes de aplicar.
 */
const API_URL_ENV_VAR_NAME = 'TWENTY_API_URL';

export const buildWebhookUrl = (registrationId: string): string => {
  const base = (process.env[API_URL_ENV_VAR_NAME] ?? '').replace(/\/+$/, '');

  if (base.length === 0) {
    throw new Error(
      'Nao sabemos a URL publica deste servidor, entao nao da para registrar o webhook. Confira o SERVER_URL da instalacao.',
    );
  }

  return `${base}/webhooks/server/${LOGIC_FUNCTIONS.webhookResolver}?registrationId=${encodeURIComponent(registrationId)}`;
};
