import { describe, expect, it } from 'vitest';

import {
  INVOICE_STATUSES,
  invoiceStatusFromGateway,
  isInvoiceOpen,
  isInvoicePaid,
} from 'src/financeiro/core/domain/value-objects/invoice-status.value-object';
import {
  moneyFromUnits,
  moneyToUnits,
  sumMoney,
} from 'src/financeiro/core/domain/value-objects/money.value-object';

describe('money', () => {
  it('soma parcelas sem o erro de ponto flutuante de reais', () => {
    const total = sumMoney([moneyFromUnits(0.1), moneyFromUnits(0.2)]);

    expect(total.amountMicros).toBe(300_000);
    expect(moneyToUnits(total)).toBe(0.3);
  });

  it('arredonda em vez de truncar quando o float nao fecha', () => {
    // 1.005 * 1e6 da 1004999.9999999999 em ponto flutuante. Truncar perderia um
    // centavo por parcela, e o total do contrato fecharia menor que a soma das
    // faturas que o gateway mostra.
    expect(moneyFromUnits(1.005).amountMicros).toBe(1_005_000);
    expect(Math.trunc(1.005 * 1_000_000)).toBe(1_004_999);
  });

  it('soma vazia vale zero na moeda padrao', () => {
    expect(sumMoney([])).toEqual({ amountMicros: 0, currencyCode: 'BRL' });
  });
});

describe('invoiceStatusFromGateway', () => {
  it.each([
    ['paid', 'PAID'],
    ['pending', 'PENDING'],
    ['waiting_payment', 'WAITING_PAYMENT'],
    ['late', 'OVERDUE'],
    ['overdue', 'OVERDUE'],
    ['expired', 'EXPIRED'],
    ['canceled', 'CANCELED'],
    ['refunded', 'CANCELED'],
  ])('traduz %s do gateway para %s', (gatewayValue, expected) => {
    expect(invoiceStatusFromGateway(gatewayValue)).toBe(expected);
  });

  it('ignora caixa e espaco', () => {
    expect(invoiceStatusFromGateway('  PAID ')).toBe('PAID');
  });

  it('status desconhecido cai em PENDING, para aparecer como a pagar em vez de sumir', () => {
    expect(invoiceStatusFromGateway('status_que_ninguem_viu')).toBe('PENDING');
  });

  // Lidos da API de producao, nao da documentacao.
  it.each([
    ['scheduled', 'PENDING'],
    ['refused', 'OVERDUE'],
    ['canceled', 'CANCELED'],
  ])('traduz %s, que a Routerfy manda de verdade, para %s', (daRouterfy, noDominio) => {
    expect(invoiceStatusFromGateway(daRouterfy)).toBe(noDominio);
  });

  // O valor cru caia direto num SELECT do Postgres e derrubava a vinculacao.
  // Qualquer saida daqui tem de ser gravavel.
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
    expect(INVOICE_STATUSES).toContain(invoiceStatusFromGateway(entrada));
  });

  // Chamar de paga uma fatura que ninguem sabe se foi paga esconde divida; o
  // contrario so mostra uma cobranca a mais, que a proxima leitura corrige.
  it('nunca inventa PAID para uma situacao desconhecida', () => {
    expect(invoiceStatusFromGateway('algo_novo')).not.toBe('PAID');
  });

  it('separa o que e a pagar do que e pago', () => {
    expect(isInvoiceOpen('OVERDUE')).toBe(true);
    expect(isInvoiceOpen('PAID')).toBe(false);
    expect(isInvoicePaid('PAID')).toBe(true);
    expect(isInvoicePaid('CANCELED')).toBe(false);
  });
});
