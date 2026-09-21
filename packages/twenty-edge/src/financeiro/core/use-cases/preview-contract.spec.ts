import { describe, expect, it } from 'vitest';

import { type FinanceiroErrorCode } from 'src/financeiro/core/domain/errors/financeiro.error';
import { previewContract } from 'src/financeiro/core/use-cases/preview-contract.use-case';
import {
  buildBusinessUnit,
  buildGatewayContract,
  FakeBusinessUnitRepository,
  FakeContractRepository,
  FakeCredentialVault,
  FakeCrmDirectory,
  FakeGateway,
} from 'src/financeiro/core/__tests__/fakes';

const credential = { apiKey: 'api-key', secretKey: 'secret-key' };

const buildDependencies = (options: {
  contract?: ReturnType<typeof buildGatewayContract> | null;
  holderEmail?: string | null;
  financeEmail?: string | null;
  existingContract?: boolean;
}) => {
  const businessUnits = new FakeBusinessUnitRepository([
    buildBusinessUnit({
      financeEmail:
        options.financeEmail === undefined
          ? 'contato@exemplo.com.br'
          : options.financeEmail,
    }),
  ]);
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

// A regra pedida: clube confere contra o financeiro da BU, membro contra o
// e-mail dele. O mesmo financeiro assina todos os contratos do clube, entao
// conferir contrato a contrato ali daria divergencia em todos.
describe('de quem e o e-mail que vale', () => {
  const clube = {
    holder: { type: 'COMPANY' as const, recordId: 'clube-1' },
    businessUnitId: 'bu-1',
    identifier: '2026051000000100',
  };

  it('no clube, confere contra o financeiro da BU e ignora o e-mail do registro', async () => {
    const dependencies = buildDependencies({
      financeEmail: 'contato@exemplo.com.br',
      holderEmail: 'outro@exemplo.com.br',
    });

    await expect(previewContract(dependencies, clube)).resolves.toMatchObject({
      emailConfere: true,
      holderEmail: 'contato@exemplo.com.br',
    });
  });

  it('no membro, confere contra o e-mail dele e ignora o da BU', async () => {
    const dependencies = buildDependencies({
      financeEmail: 'outro@exemplo.com.br',
      holderEmail: 'contato@exemplo.com.br',
    });

    await expect(previewContract(dependencies, input)).resolves.toMatchObject({
      emailConfere: true,
      holderEmail: 'contato@exemplo.com.br',
    });
  });

  it('recusa o clube quando a BU nao tem financeiro cadastrado', async () => {
    const dependencies = buildDependencies({ financeEmail: null });

    expect(await codeOf(previewContract(dependencies, clube))).toBe(
      'INVALID_INPUT',
    );
  });
});

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

  // A previa nao recusa mais por e-mail: quem vincula precisa VER o contrato
  // para decidir, e ha caso legitimo — a empresa que paga pelo membro, o
  // conjuge, o socio. A recusa mora no attach, sem confirmacao explicita.
  it('avisa, sem recusar, quando o cliente do gateway e outra pessoa', async () => {
    const dependencies = buildDependencies({
      holderEmail: 'outro@exemplo.com.br',
    });

    await expect(previewContract(dependencies, input)).resolves.toMatchObject({
      emailConfere: false,
    });
  });

  it('marca que o e-mail confere quando e a mesma pessoa', async () => {
    await expect(
      previewContract(buildDependencies({}), input),
    ).resolves.toMatchObject({ emailConfere: true });
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
