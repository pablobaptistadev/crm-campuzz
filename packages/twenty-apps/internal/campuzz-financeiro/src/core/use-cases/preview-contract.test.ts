import { describe, expect, it } from 'vitest';

import { type FinanceiroErrorCode } from 'src/core/domain/errors/financeiro.error';
import { previewContract } from 'src/core/use-cases/preview-contract.use-case';
import {
  buildBusinessUnit,
  buildGatewayContract,
  FakeBusinessUnitRepository,
  FakeContractRepository,
  FakeCredentialVault,
  FakeCrmDirectory,
  FakeGateway,
} from 'src/core/__tests__/fakes';

const credential = { apiKey: 'api-key', secretKey: 'secret-key' };

const buildDependencies = (options: {
  contract?: ReturnType<typeof buildGatewayContract> | null;
  holderEmail?: string | null;
  existingContract?: boolean;
}) => {
  const businessUnits = new FakeBusinessUnitRepository([buildBusinessUnit()]);
  const contracts = new FakeContractRepository(
    options.existingContract === true
      ? [
          {
            id: 'contract-ja-existe',
            externalSubscriptionId: 'sub-1',
            externalTransactionId: null,
            businessUnitId: 'bu-1',
            holder: { type: 'PERSON', recordId: 'outra-pessoa' },
          },
        ]
      : [],
  );

  return {
    businessUnits,
    contracts,
    directory: new FakeCrmDirectory({
      'pessoa-1': {
        email:
          options.holderEmail === undefined
            ? 'contato@exemplo.com.br'
            : options.holderEmail,
        displayName: 'Pablo',
      },
    }),
    gateway: new FakeGateway({
      contract:
        options.contract === undefined ? buildGatewayContract() : options.contract,
    }),
    vault: new FakeCredentialVault({ 'bu-1': credential }),
  };
};

const input = {
  holder: { type: 'PERSON' as const, recordId: 'pessoa-1' },
  businessUnitId: 'bu-1',
  identifier: '2026051000000100',
};

const codeOf = async (promise: Promise<unknown>): Promise<FinanceiroErrorCode> => {
  try {
    await promise;
  } catch (error) {
    return (error as { code: FinanceiroErrorCode }).code;
  }

  throw new Error('esperava um erro e nao veio nenhum');
};

describe('previewContract', () => {
  it('devolve o contrato quando o e-mail do titular bate', async () => {
    const result = await previewContract(buildDependencies({}), input);

    expect(result.contract.subscriptionId).toBe('sub-1');
    expect(result.alreadyLinkedContractId).toBeNull();
  });

  it('compara o e-mail ignorando caixa e espaco', async () => {
    const dependencies = buildDependencies({
      holderEmail: '  CONTATO@Exemplo.com.BR ',
    });

    await expect(previewContract(dependencies, input)).resolves.toMatchObject({
      holderEmail: '  CONTATO@Exemplo.com.BR ',
    });
  });

  it('recusa quando o cliente do gateway e outra pessoa', async () => {
    const dependencies = buildDependencies({
      holderEmail: 'outro@exemplo.com.br',
    });

    expect(await codeOf(previewContract(dependencies, input))).toBe(
      'EMAIL_MISMATCH',
    );
  });

  it('recusa quando o registro nao tem e-mail para conferir', async () => {
    const dependencies = buildDependencies({ holderEmail: null });

    expect(await codeOf(previewContract(dependencies, input))).toBe(
      'INVALID_INPUT',
    );
  });

  it('avisa quando o gateway nao conhece o numero informado', async () => {
    const dependencies = buildDependencies({ contract: null });

    expect(await codeOf(previewContract(dependencies, input))).toBe(
      'CONTRACT_NOT_FOUND',
    );
  });

  it('recusa identificador curto demais sem chamar o gateway', async () => {
    const dependencies = buildDependencies({});

    expect(
      await codeOf(previewContract(dependencies, { ...input, identifier: 'ab' })),
    ).toBe('INVALID_INPUT');
    expect(dependencies.gateway.findCalls).toBe(0);
  });

  it('aponta qual registro ja tem o contrato, em vez de so recusar', async () => {
    const dependencies = buildDependencies({ existingContract: true });

    const result = await previewContract(dependencies, input);

    expect(result.alreadyLinkedContractId).toBe('contract-ja-existe');
  });

  it('falha quando a BU nao tem credencial guardada', async () => {
    const dependencies = buildDependencies({});

    dependencies.vault.credentials.clear();

    expect(await codeOf(previewContract(dependencies, input))).toBe(
      'INVALID_CREDENTIALS',
    );
  });
});
