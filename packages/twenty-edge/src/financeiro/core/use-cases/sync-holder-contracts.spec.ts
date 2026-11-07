import { describe, expect, it } from 'vitest';

import { moneyFromUnits } from 'src/financeiro/core/domain/value-objects/money.value-object';
import { syncHolderContracts } from 'src/financeiro/core/use-cases/sync-holder-contracts.use-case';
import {
  buildGatewayContract,
  buildGatewayInvoice,
  FakeContractRepository,
  FakeCredentialVault,
  FakeGateway,
  FakeInvoiceRepository,
} from 'src/financeiro/core/__tests__/fakes';

const contratoDe = (
  id: string,
  holder: { type: 'COMPANY' | 'PERSON'; recordId: string },
) => ({
  id,
  externalSubscriptionId: `sub-${id}`,
  externalTransactionId: null,
  businessUnitId: 'bu-1',
  holder,
});

const clube = { type: 'COMPANY' as const, recordId: 'clube-1' };
const outroClube = { type: 'COMPANY' as const, recordId: 'clube-2' };

const buildDependencies = (contratos = [contratoDe('1', clube)]) => ({
  contracts: new FakeContractRepository(contratos),
  invoices: new FakeInvoiceRepository(),
  vault: new FakeCredentialVault({
    'bu-1': { apiKey: 'api-key', secretKey: 'secret-key' },
  }),
  gateway: new FakeGateway({
    contract: buildGatewayContract({
      invoices: [
        buildGatewayInvoice({
          externalInvoiceId: 'inv-1',
          status: 'PAID',
          amount: moneyFromUnits(100),
        }),
        buildGatewayInvoice({
          externalInvoiceId: 'inv-2',
          status: 'PENDING',
          amount: moneyFromUnits(150),
          dueAt: '2026-05-10T00:00:00.000Z',
        }),
        buildGatewayInvoice({
          externalInvoiceId: 'inv-3',
          status: 'OVERDUE',
          amount: moneyFromUnits(50),
          dueAt: '2026-03-10T00:00:00.000Z',
        }),
        buildGatewayInvoice({
          externalInvoiceId: 'inv-4',
          status: 'CANCELED',
          amount: moneyFromUnits(999),
        }),
      ],
    }),
  }),
});

describe('syncHolderContracts', () => {
  it('rele so os contratos do registro aberto', async () => {
    const dependencies = buildDependencies([
      contratoDe('1', clube),
      contratoDe('2', outroClube),
    ]);

    const result = await syncHolderContracts(dependencies, clube);

    expect(result.contracts).toHaveLength(1);
    expect(result.reconciled).toBe(1);
    expect(dependencies.invoices.upserts.map((u) => u.contractId)).toEqual(['1']);
  });

  it('um registro sem contrato nenhum devolve zerado, sem erro', async () => {
    const dependencies = buildDependencies([contratoDe('1', outroClube)]);

    const result = await syncHolderContracts(dependencies, clube);

    expect(result).toEqual({ reconciled: 0, skipped: 0, contracts: [] });
  });

  it('sincronizar duas vezes nao duplica fatura', async () => {
    const dependencies = buildDependencies();

    await syncHolderContracts(dependencies, clube);
    await syncHolderContracts(dependencies, clube);

    expect(dependencies.invoices.stored.get('1')?.size).toBe(4);
  });
});

describe('resumo das faturas', () => {
  it('separa a pagar de pago e ignora o que nao e nenhum dos dois', async () => {
    const dependencies = buildDependencies();
    const result = await syncHolderContracts(dependencies, clube);

    const summary = await dependencies.invoices.summarizeForContracts(
      result.contracts.map((contract) => contract.id),
    );

    // 150 pendente + 50 vencida. A cancelada de 999 fica fora dos dois totais:
    // nao e divida nem receita, e somar ela inflaria a tela.
    expect(summary.openAmount).toEqual(moneyFromUnits(200));
    expect(summary.paidAmount).toEqual(moneyFromUnits(100));
    expect(summary.openCount).toBe(2);
    expect(summary.paidCount).toBe(1);
  });

  it('o proximo vencimento e o mais antigo em aberto', async () => {
    const dependencies = buildDependencies();
    const result = await syncHolderContracts(dependencies, clube);

    const summary = await dependencies.invoices.summarizeForContracts(
      result.contracts.map((contract) => contract.id),
    );

    expect(summary.nextDueAt).toBe('2026-03-10T00:00:00.000Z');
  });

  it('sem contrato nenhum, os totais sao zero', async () => {
    const summary = await new FakeInvoiceRepository().summarizeForContracts([]);

    expect(summary.openAmount.amountMicros).toBe(0);
    expect(summary.paidAmount.amountMicros).toBe(0);
    expect(summary.nextDueAt).toBeNull();
  });
});
