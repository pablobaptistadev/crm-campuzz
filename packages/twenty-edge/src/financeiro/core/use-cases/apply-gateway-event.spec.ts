import { describe, expect, it } from 'vitest';

import { moneyFromUnits } from 'src/financeiro/core/domain/value-objects/money.value-object';
import { applyGatewayEvent } from 'src/financeiro/core/use-cases/apply-gateway-event.use-case';
import {
  buildBusinessUnit,
  buildGatewayContract,
  buildGatewayInvoice,
  FakeBusinessUnitRepository,
  FakeContractRepository,
  FakeCredentialVault,
  FakeEventDeduplication,
  FakeGateway,
  FakeInvoiceRepository,
} from 'src/financeiro/core/__tests__/fakes';

const storedContract = {
  id: 'contract-1',
  externalSubscriptionId: 'sub-1',
  externalTransactionId: null,
  businessUnitId: 'bu-1',
  holder: { type: 'PERSON' as const, recordId: 'pessoa-1' },
};

const buildDependencies = (
  contract = buildGatewayContract(),
  stored = [storedContract],
) => ({
  businessUnits: new FakeBusinessUnitRepository([buildBusinessUnit()]),
  contracts: new FakeContractRepository(stored),
  invoices: new FakeInvoiceRepository(),
  vault: new FakeCredentialVault({
    'bu-1': { apiKey: 'api-key', secretKey: 'secret-key' },
  }),
  gateway: new FakeGateway({ contract }),
  deduplication: new FakeEventDeduplication(),
});

const event = {
  eventId: 'evt-1',
  subscriptionId: 'sub-1',
  transactionId: null,
};

describe('applyGatewayEvent', () => {
  it('grava o que a API respondeu, nunca o que o corpo do webhook disse', async () => {
    const verdadeDaApi = buildGatewayContract({
      invoices: [
        buildGatewayInvoice({ status: 'PAID', amount: moneyFromUnits(250) }),
      ],
    });
    const dependencies = buildDependencies(verdadeDaApi);

    const outcome = await applyGatewayEvent(dependencies, {
      businessUnitId: 'bu-1',
      event,
    });

    expect(outcome).toEqual({
      applied: true,
      contractId: 'contract-1',
      invoiceCount: 1,
    });
    expect(dependencies.gateway.findCalls).toBe(1);
    expect(dependencies.invoices.upserts[0]?.invoices[0]?.amount).toEqual(
      moneyFromUnits(250),
    );
  });

  it('a reentrega do mesmo evento nao duplica fatura', async () => {
    const dependencies = buildDependencies();

    await applyGatewayEvent(dependencies, { businessUnitId: 'bu-1', event });
    const segunda = await applyGatewayEvent(dependencies, {
      businessUnitId: 'bu-1',
      event,
    });

    expect(segunda).toEqual({ applied: false, reason: 'DUPLICATE' });
    expect(dependencies.invoices.upserts).toHaveLength(1);
  });

  it('nao deixa uma BU mexer no contrato de outra', async () => {
    const dependencies = buildDependencies();

    const outcome = await applyGatewayEvent(dependencies, {
      businessUnitId: 'bu-de-outro-clube',
      event,
    });

    expect(outcome).toEqual({
      applied: false,
      reason: 'FOREIGN_BUSINESS_UNIT',
    });
    expect(dependencies.contracts.updates).toHaveLength(0);
  });

  it('marca como visto o evento de contrato que o CRM nao conhece, para o retry parar', async () => {
    const dependencies = buildDependencies(buildGatewayContract(), []);

    const outcome = await applyGatewayEvent(dependencies, {
      businessUnitId: 'bu-1',
      event,
    });

    expect(outcome).toEqual({ applied: false, reason: 'UNKNOWN_CONTRACT' });
    expect(await dependencies.deduplication.hasBeenApplied('evt-1')).toBe(true);
    expect(dependencies.gateway.findCalls).toBe(0);
  });

  it('ignora evento sem nenhum id de contrato', async () => {
    const dependencies = buildDependencies();

    const outcome = await applyGatewayEvent(dependencies, {
      businessUnitId: 'bu-1',
      event: { eventId: 'evt-2', subscriptionId: null, transactionId: null },
    });

    expect(outcome).toEqual({ applied: false, reason: 'NO_IDENTIFIER' });
  });

  it('nao marca como aplicado quando o gateway nao devolveu o contrato', async () => {
    const dependencies = buildDependencies(buildGatewayContract());

    dependencies.gateway = new FakeGateway({ contract: null });

    const outcome = await applyGatewayEvent(dependencies, {
      businessUnitId: 'bu-1',
      event,
    });

    expect(outcome).toEqual({ applied: false, reason: 'GONE_FROM_GATEWAY' });
    expect(await dependencies.deduplication.hasBeenApplied('evt-1')).toBe(false);
  });
});
