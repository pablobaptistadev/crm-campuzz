import { describe, expect, it } from 'vitest';

import { mensagemDeErroDeLogin } from 'src/ui/erroDeLogin';

describe('mensagemDeErroDeLogin', () => {
  it('senha errada aparece como senha errada, e não como falha do sistema', () => {
    expect(mensagemDeErroDeLogin('INVALID_CREDENTIALS')).toBe('E-mail ou senha incorretos.');
  });

  it('o bloqueio por excesso de tentativas diz quanto tempo esperar', () => {
    expect(mensagemDeErroDeLogin('TOO_MANY_ATTEMPTS')).toBe(
      'Muitas tentativas seguidas com este e-mail. Espere 10 minutos e tente de novo.',
    );
  });

  it('código errado ou vencido manda conferir o último e-mail', () => {
    expect(mensagemDeErroDeLogin('INVALID_LOGIN_CODE')).toBe(
      'Código incorreto ou vencido. Confira o último e-mail ou peça outro código.',
    );
  });

  it('sem resposta do servidor, fica o aviso genérico', () => {
    expect(mensagemDeErroDeLogin(null)).toBe('Não conseguimos entrar. Tente de novo em instantes.');
    expect(mensagemDeErroDeLogin('A resposta veio sem dados.')).toBe(
      'Não conseguimos entrar. Tente de novo em instantes.',
    );
  });
});
