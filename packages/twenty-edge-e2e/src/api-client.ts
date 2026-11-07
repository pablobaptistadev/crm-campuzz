export type GraphQLResponse<TData> = {
  data?: TData;
  errors?: { message: string }[];
};

// A cookie jar, because the session the API issues is an httpOnly cookie: the
// suite has to replay it exactly as a browser would for anything past sign-in.
export class ApiClient {
  private readonly cookies = new Map<string, string>();

  lastStatus = 0;

  constructor(readonly baseUrl: string) {}

  get cookieHeader(): string {
    return Array.from(this.cookies, ([name, value]) => `${name}=${value}`).join(
      '; ',
    );
  }

  get hasSession(): boolean {
    return this.cookies.size > 0;
  }

  private absorbCookies(response: Response): void {
    for (const setCookie of response.headers.getSetCookie()) {
      const [pair] = setCookie.split(';');
      const separatorIndex = pair.indexOf('=');

      if (separatorIndex < 1) {
        continue;
      }

      const name = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();

      if (value.length === 0 || setCookie.includes('Max-Age=0')) {
        this.cookies.delete(name);
        continue;
      }

      this.cookies.set(name, value);
    }
  }

  async fetch(
    path: string,
    init: RequestInit & { origin?: string } = {},
  ): Promise<Response> {
    const headers = new Headers(init.headers);

    // The API rejects any state-changing request whose Origin is not its own
    // host, so every call has to carry one — the override is what lets the
    // suite prove the rejection still happens.
    headers.set('Origin', init.origin ?? this.baseUrl);

    if (this.cookies.size > 0) {
      headers.set('Cookie', this.cookieHeader);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      redirect: 'manual',
    });

    this.lastStatus = response.status;
    this.absorbCookies(response);

    return response;
  }

  async graphql<TData>({
    endpoint,
    query,
    variables,
    operationName,
    origin,
  }: {
    endpoint: '/metadata' | '/graphql';
    query: string;
    variables?: Record<string, unknown>;
    operationName?: string;
    origin?: string;
  }): Promise<{ response: Response; body: GraphQLResponse<TData> }> {
    const response = await this.fetch(endpoint, {
      method: 'POST',
      origin,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables, operationName }),
    });

    const text = await response.text();

    try {
      return { response, body: JSON.parse(text) as GraphQLResponse<TData> };
    } catch {
      return {
        response,
        body: {
          errors: [
            {
              message: `Non-JSON response (${response.status}): ${text.slice(0, 300)}`,
            },
          ],
        },
      };
    }
  }
}

export const unwrap = <TData>(
  body: GraphQLResponse<TData>,
  context: string,
): TData => {
  if (body.errors !== undefined && body.errors.length > 0) {
    throw new Error(
      `${context}: ${body.errors.map((error) => error.message).join(' | ')}`,
    );
  }

  if (body.data === undefined || body.data === null) {
    throw new Error(`${context}: response carried no data`);
  }

  return body.data;
};
