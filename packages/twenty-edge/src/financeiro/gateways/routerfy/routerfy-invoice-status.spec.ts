import { describe, expect, it } from 'vitest';

import { situacaoDaFatura } from 'src/financeiro/gateways/routerfy/routerfy-invoice-status';

describe('situacaoDaFatura', () => {
  // Estes seis vieram de uma varredura da API de producao: e o vocabulario que
  // a Routerfy realmente usa, nao o que a documentacao promete.
  it.each([
    ['paid', 'PAID'],
    ['scheduled', 'PENDING'],
    ['pending', 'PENDING'],
    ['waiting_payment', 'WAITING_PAYMENT'],
    ['refused', 'OVERDUE'],
    ['canceled', 'CANCELED'],
  ])('traduz %s da Routerfy para %s', (daRouterfy, noDominio) => {
    expect(situacaoDaFatura(daRouterfy)).toBe(noDominio);
  });

  it('aceita a grafia com dois L, que a mesma API ja usou', () => {
    expect(situacaoDaFatura('cancelled')).toBe('CANCELED');
  });

  it('nao se importa com caixa nem com espaco em volta', () => {
    expect(situacaoDaFatura('  PAID ')).toBe('PAID');
  });

  // O valor cru caia direto num SELECT do Postgres e derrubava a vinculacao
  // inteira. Qualquer saida daqui tem de ser gravavel.
  const DO_SELECT = [
    'PAID',
    'PENDING',
    'WAITING_PAYMENT',
    'OVERDUE',
    'EXPIRED',
    'CANCELED',
  ];

  it.each([
    'paid',
    'scheduled',
    'pending',
    'processing',
    'waiting_payment',
    'refused',
    'failed',
    'overdue',
    'expired',
    'canceled',
    'cancelled',
    'refunded',
    'chargeback',
    'status_que_a_routerfy_ainda_vai_inventar',
    '',
  ])('devolve um valor que o SELECT aceita para %s', (entrada) => {
    expect(DO_SELECT).toContain(situacaoDaFatura(entrada));
  });

  it('trata ausencia como pendente, nunca como paga', () => {
    expect(situacaoDaFatura(undefined)).toBe('PENDING');
    expect(situacaoDaFatura(null)).toBe('PENDING');
  });

  // Chamar de paga uma fatura que ninguem sabe se foi paga esconde divida; o
  // contrario so mostra uma cobranca a mais, que a proxima leitura corrige.
  it('nunca inventa PAID para uma situacao desconhecida', () => {
    expect(situacaoDaFatura('algo_novo')).not.toBe('PAID');
  });
});
