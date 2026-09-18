/**
 * Chamada as rotas do proprio app, de dentro do iframe do front component.
 *
 * O sandbox nao tem o cliente do CRM, so `fetch` e as variaveis de ambiente que o
 * runtime injeta. Mesmo caminho que os apps publicos usam (ver o formulario do
 * app do Discord).
 */
export const callAppRoute = async <TResult>(
  path: string,
  body: Record<string, unknown>,
): Promise<TResult> => {
  const apiBaseUrl = process.env.TWENTY_API_URL;
  const token =
    process.env.TWENTY_APP_ACCESS_TOKEN ?? process.env.TWENTY_API_KEY;

  if (apiBaseUrl === undefined || token === undefined) {
    throw new Error('Nao conseguimos falar com o servidor a partir desta tela.');
  }

  const response = await fetch(`${apiBaseUrl}/s${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`A chamada falhou (${response.status}).`);
  }

  return (await response.json()) as TResult;
};

/**
 * Le o valor de um evento do sandbox.
 *
 * O sandbox despacha eventos com formato nao padrao: o valor pode vir em
 * `detail.value`, `value` ou `target.value`. Ler so um dos tres faz o campo
 * parecer travado em algumas versoes do runtime.
 */
export const readEventValue = (
  event: React.SyntheticEvent<HTMLElement>,
): string | undefined => {
  const candidate = event as {
    detail?: { value?: string };
    value?: string;
    target?: { value?: string };
  };

  if (typeof candidate.detail?.value === 'string') {
    return candidate.detail.value;
  }

  if (typeof candidate.value === 'string') {
    return candidate.value;
  }

  if (typeof candidate.target?.value === 'string') {
    return candidate.target.value;
  }

  return undefined;
};

export const onValueChange =
  (apply: (value: string) => void) =>
  (event: React.SyntheticEvent<HTMLElement>) => {
    const value = readEventValue(event);

    if (typeof value === 'string') {
      apply(value);
    }
  };
