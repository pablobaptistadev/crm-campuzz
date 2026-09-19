import { describe, expect, it } from 'vitest';

import {
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

  it('separa o que e a pagar do que e pago', () => {
    expect(isInvoiceOpen('OVERDUE')).toBe(true);
    expect(isInvoiceOpen('PAID')).toBe(false);
    expect(isInvoicePaid('PAID')).toBe(true);
    expect(isInvoicePaid('CANCELED')).toBe(false);
  });
});
