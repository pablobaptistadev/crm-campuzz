import { describe, expect, it } from 'vitest';

import { extractEventEnvelope } from 'src/financeiro/gateways/routerfy/routerfy-event-ids';

describe('extractEventEnvelope', () => {
  it('um subscriptionId declarado manda, venha de onde vier', () => {
    expect(
      extractEventEnvelope(
        {
          event: 'transaction.paid',
          id: 'evt-1',
          data: { id: 'trx-9', subscriptionId: 'sub-7' },
        },
        'fallback',
      ),
    ).toEqual({
      eventId: 'evt-1',
      subscriptionId: 'sub-7',
      transactionId: 'trx-9',
    });
  });

  it('acha o subscriptionId declarado dentro das faturas', () => {
    expect(
      extractEventEnvelope(
        {
          event: 'subscription.paid',
          id: 'evt-2',
          data: { id: 'algo', invoices: [{ subscriptionId: 'sub-8' }] },
        },
        'fallback',
      ).subscriptionId,
    ).toBe('sub-8');
  });

  it('acha o subscriptionId declarado dentro dos itens', () => {
    expect(
      extractEventEnvelope(
        {
          event: 'subscription.canceled',
          data: { id: 'algo', items: [{ subscriptionId: 'sub-9' }] },
        },
        'fallback',
      ).subscriptionId,
    ).toBe('sub-9');
  });

  it('em subscription.*, data.id e o contrato', () => {
    expect(
      extractEventEnvelope(
        { event: 'subscription.paid', id: 'evt-3', data: { id: 'sub-1' } },
        'fallback',
      ),
    ).toEqual({
      eventId: 'evt-3',
      subscriptionId: 'sub-1',
      transactionId: null,
    });
  });

  it('em transaction.*, data.id e a transacao e o contrato NAO recebe nada', () => {
    expect(
      extractEventEnvelope(
        { event: 'transaction.paid', id: 'evt-4', data: { id: 'trx-1' } },
        'fallback',
      ),
    ).toEqual({
      eventId: 'evt-4',
      subscriptionId: null,
      transactionId: 'trx-1',
    });
  });

  it('evento de familia desconhecida nao chuta de que lado o id cai', () => {
    expect(
      extractEventEnvelope(
        { event: 'alguma.coisa.nova', id: 'evt-5', data: { id: 'x-1' } },
        'fallback',
      ),
    ).toEqual({
      eventId: 'evt-5',
      subscriptionId: null,
      transactionId: null,
    });
  });

  it('usa o eventId de reserva quando o payload nao traz um', () => {
    expect(
      extractEventEnvelope(
        { event: 'subscription.paid', data: { id: 'sub-1' } },
        'reserva-123',
      ).eventId,
    ).toBe('reserva-123');
  });

  it('aceita id numerico e descarta string vazia', () => {
    expect(
      extractEventEnvelope(
        { event: 'subscription.paid', data: { id: 12345 } },
        'reserva',
      ).subscriptionId,
    ).toBe('12345');

    expect(
      extractEventEnvelope(
        { event: 'subscription.paid', data: { id: '   ' } },
        'reserva',
      ).subscriptionId,
    ).toBeNull();
  });
});
