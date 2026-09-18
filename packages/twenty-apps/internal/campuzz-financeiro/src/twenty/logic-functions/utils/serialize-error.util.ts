import { FinanceiroError } from 'src/core/domain/errors/financeiro.error';

export type FailureResponse = {
  success: false;
  code: string;
  error: string;
};

/**
 * Traduz a excecao para o que o popup mostra.
 *
 * A mensagem vem pronta do dominio, na voz do produto, e nao e reescrita aqui:
 * reescrever criaria uma segunda versao do mesmo texto, e uma delas ficaria para
 * tras. Erro que nao e do dominio vira uma frase generica de proposito — o
 * detalhe tecnico interessa ao log, nao a quem esta cadastrando um contrato.
 */
export const serializeError = (error: unknown): FailureResponse => {
  if (error instanceof FinanceiroError) {
    return { success: false, code: error.code, error: error.message };
  }

  console.error(
    JSON.stringify({
      level: 'error',
      scope: 'campuzz-financeiro',
      error: error instanceof Error ? error.message : String(error),
    }),
  );

  return {
    success: false,
    code: 'UNEXPECTED',
    error: 'Nao conseguimos concluir agora. Tente de novo em instantes.',
  };
};
