/**
 * Erros que a regra de negocio sabe nomear.
 *
 * Cada um carrega a mensagem que a pessoa le, ja na voz do produto (primeira
 * pessoa do plural). A casca do SDK so serializa `code` e `message`, sem
 * reescrever texto: assim a mensagem nasce onde a decisao foi tomada, e nao ha
 * duas versoes dela.
 */
export type FinanceiroErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_CREDENTIALS'
  | 'BUSINESS_UNIT_NOT_FOUND'
  | 'CONTRACT_NOT_FOUND'
  | 'EMAIL_MISMATCH'
  | 'DUPLICATE_CONTRACT'
  | 'GATEWAY_UNAVAILABLE';

export class FinanceiroError extends Error {
  readonly code: FinanceiroErrorCode;

  constructor(code: FinanceiroErrorCode, message: string) {
    super(message);
    this.name = 'FinanceiroError';
    this.code = code;
  }
}

export const invalidInput = (message: string): FinanceiroError =>
  new FinanceiroError('INVALID_INPUT', message);

export const invalidCredentials = (): FinanceiroError =>
  new FinanceiroError(
    'INVALID_CREDENTIALS',
    'Nao conseguimos validar essas chaves no gateway. Confira a api key e a secret key e tente de novo.',
  );

export const businessUnitNotFound = (): FinanceiroError =>
  new FinanceiroError(
    'BUSINESS_UNIT_NOT_FOUND',
    'Nao encontramos uma BU para usar aqui. Cadastre uma ou marque alguma como padrao.',
  );

export const contractNotFound = (identifier: string): FinanceiroError =>
  new FinanceiroError(
    'CONTRACT_NOT_FOUND',
    `Nao localizamos o contrato ou a transacao "${identifier}" nesta BU. Confira o numero e a BU selecionada.`,
  );

export const emailMismatch = (): FinanceiroError =>
  new FinanceiroError(
    'EMAIL_MISMATCH',
    'O e-mail deste registro nao e o mesmo do cliente no gateway. Nao vinculamos o contrato para evitar amarrar a pessoa errada.',
  );

export const duplicateContract = (): FinanceiroError =>
  new FinanceiroError(
    'DUPLICATE_CONTRACT',
    'Este contrato ja esta vinculado a outro registro. Abra o contrato existente em vez de criar um segundo.',
  );

export const gatewayUnavailable = (detail: string): FinanceiroError =>
  new FinanceiroError(
    'GATEWAY_UNAVAILABLE',
    `Nao conseguimos falar com o gateway agora. ${detail}`,
  );
