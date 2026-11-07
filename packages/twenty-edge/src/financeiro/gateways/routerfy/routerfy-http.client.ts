import {
  DEFAULT_ROUTERFY_API_URL,
  ROUTERFY_API_URL_ENV_VAR_NAME,
  ROUTERFY_TIMEOUT_MS,
} from 'src/financeiro/gateways/routerfy/routerfy.constants';

export type RouterfyCredentialHeaders = {
  apiKey: string;
  secretKey: string;
};

export type RouterfyResponse<TBody> = {
  status: number;
  body: TBody | null;
};

export class RouterfyHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'RouterfyHttpError';
    this.status = status;
  }
}

const baseUrl = (): string =>
  process.env[ROUTERFY_API_URL_ENV_VAR_NAME]?.replace(/\/+$/, '') ??
  DEFAULT_ROUTERFY_API_URL;

/**
 * O cliente HTTP da Routerfy.
 *
 * 404 nao lanca: "nao existe" e resposta valida para quem procura um contrato
 * por um numero que a pessoa digitou. Qualquer outro erro lanca, porque nesses
 * casos nao sabemos se o contrato existe — e tratar "nao sei" como "nao existe"
 * faria o preview recusar um contrato bom.
 */
export const routerfyRequest = async <TBody>(
  path: string,
  credential: RouterfyCredentialHeaders,
  init: { method: 'GET' | 'POST' | 'DELETE'; body?: unknown } = {
    method: 'GET',
  },
): Promise<RouterfyResponse<TBody>> => {
  let response: Response;

  try {
    response = await fetch(`${baseUrl()}${path}`, {
      method: init.method,
      headers: {
        'x-api-key': credential.apiKey,
        'x-secret-key': credential.secretKey,
        ...(init.body === undefined
          ? {}
          : { 'content-type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(ROUTERFY_TIMEOUT_MS),
    });
  } catch (error) {
    throw new RouterfyHttpError(
      0,
      error instanceof Error ? error.message : 'falha de rede',
    );
  }

  if (response.status === 404) {
    return { status: 404, body: null };
  }

  if (!response.ok) {
    throw new RouterfyHttpError(
      response.status,
      `A Routerfy respondeu ${response.status}.`,
    );
  }

  if (response.status === 204) {
    return { status: response.status, body: null };
  }

  const body = (await response.json().catch(() => null)) as TBody | null;

  return { status: response.status, body };
};
