/**
 * Teto de espera para QUALQUER chamada a Routerfy.
 *
 * Este numero vem de um incidente de producao no Campuzz, nao de chute. O cliente
 * la rodava sem timeout: `getCheckoutById` roda dentro do processamento de cada
 * webhook, segurando conexoes do pool enquanto espera. Com a Routerfy lenta e uma
 * rajada de webhooks, o pool esgotou e os webhooks seguintes morreram com
 * "Timeout acquiring a connection" — sem entregar nada e sem ninguem olhar.
 *
 * 15s e folgado para uma API que normalmente responde em menos de um segundo, e
 * curto o bastante para nao segurar recurso indefinidamente. Falhar rapido deixa
 * um motivo registrado, que da para reprocessar; travar nao deixa nada.
 */
export const ROUTERFY_TIMEOUT_MS = 15_000;

export const ROUTERFY_API_URL_ENV_VAR_NAME = 'ROUTERFY_API_URL';

export const DEFAULT_ROUTERFY_API_URL = 'https://api.routerfy.com';
