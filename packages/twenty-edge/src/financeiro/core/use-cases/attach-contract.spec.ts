import { describe, expect, it } from 'vitest';

import { type FinanceiroErrorCode } from 'src/financeiro/core/domain/errors/financeiro.error';
import { attachContract } from 'src/financeiro/core/use-cases/attach-contract.use-case';
import {
  buildBusinessUnit,
  buildGatewayContract,
  buildGatewayInvoice,
  FakeBusinessUnitRepository,
  FakeContractRepository,
  FakeCredentialVault,
  FakeCrmDirectory,
  FakeGateway,
  FakeInvoiceRepository,
} from 'src/financeiro/core/__tests__/fakes';

// O dono aqui e um clube, e clube confere contra o financeiro cadastrado na BU.
const buildDependencies = (existing: boolean, holderEmail = 'contato@exemplo.com.br') => ({
  businessUnits: new FakeBusinessUnitRepository([
    buildBusinessUnit({ financeEmail: holderEmail }),
  ]),
  contracts: new FakeContractRepository(
    existing
      ? [
          {
            id: 'contract-ja-existe',
            externalSubscriptionId: 'sub-1',
            externalTransactionId: null,
            businessUnitId: 'bu-1',
            holder: { type: 'COMPANY' as const, recordId: 'clube-9' },
          },
        ]
      : [],
  ),
  invoices: new FakeInvoiceRepository(),
  directory: new FakeCrmDirectory({
    'clube-1': { email: holderEmail, financeEmail: null, displayName: 'Clube Alpha' },
  }),
  gateway: new FakeGateway({
    contract: buildGatewayContract({
      invoices: [
        buildGatewayInvoice({ externalInvoiceId: 'inv-1' }),
        buildGatewayInvoice({ externalInvoiceId: 'inv-2', status: 'PAID' }),
      ],
    }),
  }),
  vault: new FakeCredentialVault({
    'bu-1': { apiKey: 'api-key', secretKey: 'secret-key' },
  }),
});

const input = {
  holder: { type: 'COMPANY' as const, recordId: 'clube-1' },
  businessUnitId: 'bu-1',
  identifier: '2026051000000100',
};

describe('attachContract', () => {
  it('cria o contrato no clube e traz as faturas junto', async () => {
    const dependencies = buildDependencies(false);

    const result = await attachContract(dependencies, input);

    expect(result.invoiceCount).toBe(2);
    expect(result.contract.holder).toEqual({
      type: 'COMPANY',
      recordId: 'clube-1',
    });
    expect(result.contract.businessUnitId).toBe('bu-1');
    expect(dependencies.invoices.upserts[0]?.contractId).toBe(
      result.contract.id,
    );
  });

  it('recusa quando o contrato ja esta vinculado em outro lugar', async () => {
    const dependencies = buildDependencies(true);

    let code: FinanceiroErrorCode | null = null;

    try {
      await attachContract(dependencies, input);
    } catch (error) {
      code = (error as { code: FinanceiroErrorCode }).code;
    }

    expect(code).toBe('DUPLICATE_CONTRACT');
    expect(dependencies.invoices.upserts).toHaveLength(0);
  });

  // A trava de titular vive aqui, e nao mais na previa: a pessoa precisa ver o
  // contrato para decidir. Por omissao continua recusando, porque um numero
  // digitado errado amarra a cobranca na ficha errada sem ninguem notar.
  it('recusa por omissao quando o titular no gateway e outra pessoa', async () => {
    const dependencies = buildDependencies(false, 'outro@exemplo.com.br');

    let code: FinanceiroErrorCode | null = null;

    try {
      await attachContract(dependencies, input);
    } catch (error) {
      code = (error as { code: FinanceiroErrorCode }).code;
    }

    expect(code).toBe('EMAIL_MISMATCH');
    expect(dependencies.invoices.upserts).toHaveLength(0);
  });

  it('vincula com titular diferente quando alguem confirma explicitamente', async () => {
    const dependencies = buildDependencies(false, 'outro@exemplo.com.br');

    const result = await attachContract(dependencies, {
      ...input,
      permitirEmailDiferente: true,
    });

    expect(result.invoiceCount).toBe(2);
    expect(dependencies.invoices.upserts).toHaveLength(1);
  });

  // Confirmar titular diferente nao pode destravar a duplicata: sao travas
  // distintas, e o mesmo contrato em dois registros duplica a cobranca.
  it('nao deixa a confirmacao de titular passar por cima da duplicata', async () => {
    const dependencies = buildDependencies(true, 'outro@exemplo.com.br');

    let code: FinanceiroErrorCode | null = null;

    try {
      await attachContract(dependencies, {
        ...input,
        permitirEmailDiferente: true,
      });
    } catch (error) {
      code = (error as { code: FinanceiroErrorCode }).code;
    }

    expect(code).toBe('DUPLICATE_CONTRACT');
  });
});
