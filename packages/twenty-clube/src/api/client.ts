export class ApiError extends Error {
  readonly isUnauthenticated: boolean;

  constructor(message: string, isUnauthenticated = false) {
    super(message);
    this.name = 'ApiError';
    this.isUnauthenticated = isUnauthenticated;
  }
}

type GraphQLResponse<TData> = {
  data?: TData;
  errors?: { message: string; extensions?: { code?: string } }[];
};

// Same origin as the API, so the session cookie rides along on its own and
// there is no token to keep anywhere in the page.
const request = async <TData>(
  endpoint: '/graphql' | '/metadata',
  query: string,
  variables?: Record<string, unknown>,
): Promise<TData> => {
  const response = await fetch(endpoint, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  if (response.status === 401) {
    throw new ApiError('Sua sessão expirou.', true);
  }

  // A GraphQL error comes back 200 with an errors array, so the status alone
  // never tells us whether the call worked.
  const body = (await response.json()) as GraphQLResponse<TData>;

  if (body.errors !== undefined && body.errors.length > 0) {
    const first = body.errors[0];
    const isUnauthenticated =
      first?.extensions?.code === 'UNAUTHENTICATED' ||
      /não autenticad|unauthenticated/i.test(first?.message ?? '');

    throw new ApiError(first?.message ?? 'Erro inesperado.', isUnauthenticated);
  }

  if (body.data === undefined) {
    throw new ApiError('A resposta veio sem dados.');
  }

  return body.data;
};

export const gql = <TData>(query: string, variables?: Record<string, unknown>) =>
  request<TData>('/graphql', query, variables);

export const meta = <TData>(query: string, variables?: Record<string, unknown>) =>
  request<TData>('/metadata', query, variables);
