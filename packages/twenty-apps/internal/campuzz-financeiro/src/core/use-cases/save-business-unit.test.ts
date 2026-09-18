import { describe, expect, it } from 'vitest';

import { type FinanceiroErrorCode } from 'src/core/domain/errors/financeiro.error';
import { saveBusinessUnit } from 'src/core/use-cases/save-business-unit.use-case';
import {
  buildBusinessUnit,
  FakeBusinessUnitRepository,
  FakeCredentialVault,
  FakeGateway,
  FakeWebhookRegistry,
  fixedClock,
  fixedIdentifiers,
} from 'src/core/__tests__/fakes';

const credential = { apiKey: 'api-key-123456', secretKey: 'secret-key' };

const buildDependencies = (options: {
  credentialsAccepted?: boolean;
  existing?: boolean;
} = {}) => {
  const businessUnits = new FakeBusinessUnitRepository(
    options.existing === true ? [buildBusinessUnit()] : [],
  );

  return {
    businessUnits,
    gateway: new FakeGateway({
      credentialsAccepted: options.credentialsAccepted ?? true,
    }),
    vault: new FakeCredentialVault(
      options.existing === true
        ? { 'bu-1': { apiKey: 'antiga', secretKey: 'antiga' } }
        : {},
    ),
    webhooks: new FakeWebhookRegistry(),
    clock: fixedClock(),
    identifiers: fixedIdentifiers('reg-novo'),
    buildWebhookUrl: (registrationId: string) =>
      `https://crm.exemplo/webhook?registrationId=${registrationId}`,
    workspaceId: 'workspace-1',
    fingerprint: (apiKey: string) => `fp-${apiKey}`,
  };
};

describe('saveBusinessUnit', () => {
  it('valida a chave antes de gravar qualquer coisa', async () => {
    const dependencies = buildDependencies({ credentialsAccepted: false });

    let code: FinanceiroErrorCode | null = null;

    try {
      await saveBusinessUnit(dependencies, {
        name: 'BU Alpha',
        credential,
        isDefault: true,
      });
    } catch (error) {
      code = (error as { code: FinanceiroErrorCode }).code;
    }

    expect(code).toBe('INVALID_CREDENTIALS');
    expect(dependencies.businessUnits.units.size).toBe(0);
    expect(dependencies.vault.credentials.size).toBe(0);
    expect(dependencies.gateway.registeredUrls).toHaveLength(0);
  });

  it('cadastra, guarda a chave no cofre e reivindica o bus', async () => {
    const dependencies = buildDependencies();

    const saved = await saveBusinessUnit(dependencies, {
      name: '  BU Alpha  ',
      credential,
      isDefault: true,
    });

    expect(saved.name).toBe('BU Alpha');
    expect(saved.connectionStatus).toBe('ACTIVE');
    expect(saved.webhookRegistrationId).toBe('reg-novo');
    expect(saved.gatewayWebhookId).toBe('gw-hook-new');
    expect(dependencies.vault.credentials.get(saved.id)).toEqual(credential);
    expect(dependencies.webhooks.claims.get('reg-novo')).toEqual({
      workspaceId: 'workspace-1',
      businessUnitId: saved.id,
    });
  });

  it('nunca expoe a chave inteira no registro', async () => {
    const dependencies = buildDependencies();

    const saved = await saveBusinessUnit(dependencies, {
      name: 'BU Alpha',
      credential,
      isDefault: false,
    });

    expect(saved.apiKeyPreview).not.toContain(credential.apiKey);
    expect(JSON.stringify(saved)).not.toContain(credential.secretKey);
  });

  it('ao reconfigurar, remove o webhook antigo antes de registrar o novo', async () => {
    const dependencies = buildDependencies({ existing: true });

    await saveBusinessUnit(dependencies, {
      businessUnitId: 'bu-1',
      name: 'BU Alpha',
      credential,
      isDefault: false,
    });

    expect(dependencies.gateway.removedWebhooks).toEqual(['gw-hook-1']);
    expect(dependencies.webhooks.released).toEqual(['reg-1']);
    expect(dependencies.webhooks.claims.has('reg-novo')).toBe(true);
  });

  it('marcar como padrao desmarca a anterior', async () => {
    const dependencies = buildDependencies();

    const saved = await saveBusinessUnit(dependencies, {
      name: 'BU Alpha',
      credential,
      isDefault: true,
    });

    expect(dependencies.businessUnits.clearDefaultCalls).toEqual([saved.id]);
  });

  it('exige nome e chaves preenchidos', async () => {
    const dependencies = buildDependencies();

    await expect(
      saveBusinessUnit(dependencies, {
        name: '   ',
        credential,
        isDefault: false,
      }),
    ).rejects.toThrowError();

    await expect(
      saveBusinessUnit(dependencies, {
        name: 'BU Alpha',
        credential: { apiKey: '', secretKey: '' },
        isDefault: false,
      }),
    ).rejects.toThrowError();
  });
});
