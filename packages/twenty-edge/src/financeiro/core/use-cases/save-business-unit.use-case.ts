import {
  apiKeyPreviewFrom,
  type BusinessUnit,
  type GatewayCredential,
} from 'src/financeiro/core/domain/entities/business-unit.entity';
import {
  invalidCredentials,
  invalidInput,
} from 'src/financeiro/core/domain/errors/financeiro.error';
import { type BusinessUnitRepositoryPort } from 'src/financeiro/core/ports/business-unit-repository.port';
import { type ClockPort } from 'src/financeiro/core/ports/clock.port';
import { type CredentialVaultPort } from 'src/financeiro/core/ports/credential-vault.port';
import { type IdentifierGeneratorPort } from 'src/financeiro/core/ports/identifier-generator.port';
import { type PaymentGatewayPort } from 'src/financeiro/core/ports/payment-gateway.port';
import { type WebhookRegistryPort } from 'src/financeiro/core/ports/webhook-registry.port';

export type SaveBusinessUnitDependencies = {
  businessUnits: BusinessUnitRepositoryPort;
  gateway: PaymentGatewayPort;
  vault: CredentialVaultPort;
  webhooks: WebhookRegistryPort;
  clock: ClockPort;
  identifiers: IdentifierGeneratorPort;
  /** Monta a URL publica do resolver para um dado registrationId. */
  buildWebhookUrl(registrationId: string): string;
  workspaceId: string;
  /** Hash da api key. Vem de fora porque o core nao conhece crypto. */
  fingerprint(apiKey: string): string;
};

export type SaveBusinessUnitInput = {
  businessUnitId?: string;
  name: string;
  credential: GatewayCredential;
  isDefault: boolean;
};

/**
 * Cadastra ou reconfigura uma BU.
 *
 * A ordem importa: validamos a credencial ANTES de gravar qualquer coisa. Uma BU
 * gravada com chave errada aparece na lista como se servisse, e o erro so
 * apareceria na hora de vincular um contrato — longe da tela que o causou.
 *
 * O webhook antigo e removido antes do novo ser registrado. Deixar os dois no ar
 * faria o gateway entregar o mesmo evento duas vezes, e a dedup e por evento, nao
 * por registro.
 */
export const saveBusinessUnit = async (
  dependencies: SaveBusinessUnitDependencies,
  input: SaveBusinessUnitInput,
): Promise<BusinessUnit> => {
  const {
    businessUnits,
    gateway,
    vault,
    webhooks,
    clock,
    identifiers,
    buildWebhookUrl,
    workspaceId,
    fingerprint,
  } = dependencies;

  const name = input.name.trim();

  if (name.length === 0) {
    throw invalidInput('Precisamos de um nome para reconhecer esta BU depois.');
  }

  if (
    input.credential.apiKey.trim().length === 0 ||
    input.credential.secretKey.trim().length === 0
  ) {
    throw invalidInput('Informe a api key e a secret key da BU.');
  }

  const isAccepted = await gateway.validateCredentials(input.credential);

  if (!isAccepted) {
    throw invalidCredentials();
  }

  const existing =
    input.businessUnitId !== undefined
      ? await businessUnits.findById(input.businessUnitId)
      : null;

  if (existing?.gatewayWebhookId != null) {
    const previousCredential = await vault.read(existing.id);

    await gateway
      .removeWebhook(
        existing.gatewayWebhookId,
        previousCredential ?? input.credential,
      )
      .catch(() => {
        // Webhook orfao no gateway e barulho, nao perda de dado: a reivindicacao
        // e liberada abaixo, entao ele passa a bater num 404 do resolver. Falhar
        // o cadastro inteiro por causa disso seria pior.
      });

    if (existing.webhookRegistrationId !== null) {
      await webhooks.release(existing.webhookRegistrationId);
    }
  }

  const registrationId = identifiers.generate();

  const gatewayWebhookId = await gateway.registerWebhook(
    buildWebhookUrl(registrationId),
    input.credential,
  );

  const saved = await businessUnits.save({
    id: existing?.id,
    name,
    gatewayProvider: gateway.provider,
    apiKeyPreview: apiKeyPreviewFrom(input.credential.apiKey),
    keyFingerprint: fingerprint(input.credential.apiKey),
    webhookRegistrationId: registrationId,
    gatewayWebhookId,
    connectionStatus: 'ACTIVE',
    lastValidatedAt: clock.nowIso(),
    isDefault: input.isDefault,
  });

  await vault.write(saved.id, input.credential);

  await webhooks.claim(registrationId, {
    workspaceId,
    businessUnitId: saved.id,
  });

  if (input.isDefault) {
    await businessUnits.clearDefaultExcept(saved.id);
  }

  return saved;
};
