import { describe, expect, it } from 'vitest';

import { syncContractInvoices } from 'src/core/use-cases/sync-contract-invoices.use-case';
import {
  buildGatewayContract,
  FakeContractRepository,
  FakeCredentialVault,
  FakeGateway,
  FakeInvoiceRepository,
} from 'src/core/__tests__/fakes';

const contratoDe = (id: string, businessUnitId: string) => ({
  id,
  externalSubscriptionId: `sub-${id}`,
  externalTransactionId: null,
  businessUnitId,
  holder: { type: 'PERSON' as const, recordId: `pessoa-${id}` },
});

describe('syncContractInvoices', () => {
  it('reconcilia todos os contratos ativos', async () => {
    const dependencies = {
      contracts: new FakeContractRepository([
        contratoDe('1', 'bu-1'),
        contratoDe('2', 'bu-1'),
      ]),
      invoices: new FakeInvoiceRepository(),
      vault: new FakeCredentialVault({
        'bu-1': { apiKey: 'api-key', secretKey: 'secret-key' },
      }),
      gateway: new FakeGateway({ contract: buildGatewayContract() }),
    };

    const result = await syncContractInvoices(dependencies);

    expect(result).toEqual({ reconciled: 2, skipped: 0 });
    expect(dependencies.invoices.upserts).toHaveLength(2);
  });

  it('um contrato sem credencial nao derruba a varredura dos outros', async () => {
    const dependencies = {
      contracts: new FakeContractRepository([
        contratoDe('1', 'bu-sem-credencial'),
        contratoDe('2', 'bu-1'),
      ]),
      invoices: new FakeInvoiceRepository(),
      vault: new FakeCredentialVault({
        'bu-1': { apiKey: 'api-key', secretKey: 'secret-key' },
      }),
      gateway: new FakeGateway({ contract: buildGatewayContract() }),
    };

    const result = await syncContractInvoices(dependencies);

    expect(result).toEqual({ reconciled: 1, skipped: 1 });
  });
});
