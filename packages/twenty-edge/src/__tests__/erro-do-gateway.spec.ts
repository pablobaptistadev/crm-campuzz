import { describe, expect, it } from 'vitest';

import { FinanceiroError } from 'src/financeiro/core/domain/errors/financeiro.error';
import { comoErroDeNegocio } from 'src/financeiro/infra/erro-do-gateway';
import { RouterfyHttpError } from 'src/financeiro/gateways/routerfy/routerfy-http.client';

const codigoDe = (causa: unknown, identificador = 'ABC-1') => {
  const traduzido = comoErroDeNegocio(causa, identificador);

  return traduzido instanceof FinanceiroError ? traduzido.code : null;
};

describe('erro do gateway virando erro de negócio', () => {
  // O caso que motivou tudo: a Routerfy responde 400 a um id que não consegue
  // interpretar, e sem isso um dígito errado virava "Internal Server Error".
  it('trata 400 como contrato não encontrado', () => {
    expect(codigoDe(new RouterfyHttpError(400, 'A Routerfy respondeu 400.'))).toBe(
      'CONTRACT_NOT_FOUND',
    );
  });

  it('trata 404 e 422 como contrato não encontrado', () => {
    expect(codigoDe(new RouterfyHttpError(404, ''))).toBe('CONTRACT_NOT_FOUND');
    expect(codigoDe(new RouterfyHttpError(422, ''))).toBe('CONTRACT_NOT_FOUND');
  });

  it('põe o número digitado na mensagem, para a pessoa conferir', () => {
    const erro = comoErroDeNegocio(new RouterfyHttpError(400, ''), 'SUB-9911');

    expect((erro as FinanceiroError).message).toContain('SUB-9911');
  });

  // Chave recusada não pode virar "não encontramos o contrato": mandaria a
  // pessoa procurar o número certo quando o problema é a credencial.
  it('trata 401 e 403 como chave recusada', () => {
    expect(codigoDe(new RouterfyHttpError(401, ''))).toBe('INVALID_CREDENTIALS');
    expect(codigoDe(new RouterfyHttpError(403, ''))).toBe('INVALID_CREDENTIALS');
  });

  // Dizer "não existe" num 500 faria a tela recusar um contrato que existe.
  it('mantém 5xx como falha do gateway', () => {
    expect(codigoDe(new RouterfyHttpError(503, ''))).toBe('GATEWAY_UNAVAILABLE');
  });

  it('trata falha de rede como falha do gateway', () => {
    const erro = comoErroDeNegocio(new RouterfyHttpError(0, 'timeout'), 'X');

    expect((erro as FinanceiroError).code).toBe('GATEWAY_UNAVAILABLE');
    expect((erro as FinanceiroError).message).toContain('Tente de novo');
  });

  // Erro nosso não pode ser disfarçado de erro do gateway: um bug no SQL tem de
  // continuar estourando como bug.
  it('deixa passar qualquer erro que não seja do gateway', () => {
    const nosso = new Error('column "xyz" does not exist');

    expect(comoErroDeNegocio(nosso, 'X')).toBe(nosso);
  });

  it('deixa passar o erro de negócio que já veio pronto', () => {
    const jaEra = new FinanceiroError('EMAIL_MISMATCH', 'não bate');

    expect(comoErroDeNegocio(jaEra, 'X')).toBe(jaEra);
  });
});
