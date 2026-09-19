import { describe, expect, it } from 'vitest';

import { moneyFromUnits } from 'src/financeiro/core/domain/value-objects/money.value-object';
import {
  mapSubscription,
  mapTransaction,
  totalValueOf,
} from 'src/financeiro/gateways/routerfy/routerfy-contract.mapper';
import { unwrapList } from 'src/financeiro/gateways/routerfy/routerfy-payload.types';

describe('unwrapList', () => {
  it('aceita os dois formatos que a Routerfy usa para lista', () => {
    expect(unwrapList([{ id: 'a' }])).toEqual([{ id: 'a' }]);
    expect(unwrapList({ data: [{ id: 'a' }] })).toEqual([{ id: 'a' }]);
    expect(unwrapList({})).toEqual([]);
    expect(unwrapList(null)).toEqual([]);
  });
});

describe('mapSubscription', () => {
  it('converte valores em reais para micros', () => {
    const contract = mapSubscription({
      id: 'sub-1',
      amount: 199.9,
      invoices: [{ id: 'inv-1', amount: 199.9 }],
    });

    expect(contract.amount).toEqual(moneyFromUnits(199.9));
    expect(contract.invoices[0]?.amount).toEqual(moneyFromUnits(199.9));
  });

  it('traduz o metodo de pagamento, e mantem o desconhecido como veio', () => {
    expect(
      mapSubscription({ paymentMethods: [{ paymentMethod: 'credit_card' }] })
        .paymentMethod,
    ).toBe('Cartao de credito');
    expect(
      mapSubscription({ paymentMethods: [{ paymentMethod: 'cripto' }] })
        .paymentMethod,
    ).toBe('cripto');
  });

  it('so aceita frequencia que conhece', () => {
    expect(mapSubscription({ frequency: 'month' }).frequency).toBe('month');
    expect(mapSubscription({ frequency: 'decada' }).frequency).toBeNull();
  });

  it('da a fatura sem id uma chave estavel em vez de descarta-la', () => {
    const contract = mapSubscription({
      invoices: [{ code: 'FAT-1' }, {}],
    });

    expect(contract.invoices[0]?.externalInvoiceId).toBe('FAT-1');
    expect(contract.invoices[1]?.externalInvoiceId).toBe('sem-id-1');
  });

  it('aguenta um payload vazio sem quebrar', () => {
    const contract = mapSubscription({});

    expect(contract.kind).toBe('SUBSCRIPTION');
    expect(contract.status).toBe('unknown');
    expect(contract.invoices).toEqual([]);
    expect(contract.customer.email).toBeNull();
  });
});

describe('mapTransaction', () => {
  it('sintetiza uma fatura para a venda a vista nao ficar sem financeiro', () => {
    const contract = mapTransaction({
      id: 'trx-1',
      code: 'T-1',
      status: 'paid',
      total: 500,
      paidAt: '2026-03-01T00:00:00.000Z',
    });

    expect(contract.kind).toBe('TRANSACTION');
    expect(contract.transactionId).toBe('trx-1');
    expect(contract.subscriptionId).toBeNull();
    expect(contract.invoices).toHaveLength(1);
    expect(contract.invoices[0]?.amount).toEqual(moneyFromUnits(500));
  });

  it('prefere o total ao amount quando os dois vem', () => {
    expect(mapTransaction({ amount: 100, total: 120 }).amount).toEqual(
      moneyFromUnits(120),
    );
  });
});

describe('totalValueOf', () => {
  it('soma as faturas, que e onde desconto e acrescimo aparecem', () => {
    const contract = mapSubscription({
      amount: 100,
      invoices: [{ id: 'a', amount: 90 }, { id: 'b', amount: 100 }],
    });

    expect(totalValueOf(contract)).toEqual(moneyFromUnits(190));
  });

  it('sem faturas, cai no valor do contrato', () => {
    expect(totalValueOf(mapSubscription({ amount: 100 }))).toEqual(
      moneyFromUnits(100),
    );
  });
});
