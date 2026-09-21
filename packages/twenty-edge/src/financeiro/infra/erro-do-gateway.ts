import {
  FinanceiroError,
  contractNotFound,
  invalidCredentials,
} from 'src/financeiro/core/domain/errors/financeiro.error';
import { RouterfyHttpError } from 'src/financeiro/gateways/routerfy/routerfy-http.client';

// O cliente da Routerfy só engole 404. Ela, porém, responde 400 a um id que não
// consegue interpretar — e isso é "esse número não existe aqui", não "o gateway
// caiu". Sem esta tradução, um erro de digitação vira 500 e a tela mostra
// "Internal Server Error" para quem só errou um dígito.
const NAO_EXISTE = new Set([400, 404, 422]);
const CHAVE_RECUSADA = new Set([401, 403]);

export const comoErroDeNegocio = (
  causa: unknown,
  identificador: string,
): unknown => {
  if (!(causa instanceof RouterfyHttpError)) {
    return causa;
  }

  if (NAO_EXISTE.has(causa.status)) {
    return contractNotFound(identificador);
  }

  if (CHAVE_RECUSADA.has(causa.status)) {
    return invalidCredentials();
  }

  // Timeout e 5xx continuam sendo falha do gateway: dizer "não existe" aqui
  // faria a tela recusar um contrato que existe.
  return new FinanceiroError(
    'GATEWAY_UNAVAILABLE',
    causa.status === 0
      ? 'Não conseguimos falar com a Routerfy agora. Tente de novo em instantes.'
      : `A Routerfy respondeu ${causa.status}. Tente de novo em instantes.`,
  );
};
