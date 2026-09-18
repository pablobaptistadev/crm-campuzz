import { CoreApiClient } from 'twenty-client-sdk/core';

import { type PaymentGatewayPort } from 'src/core/ports/payment-gateway.port';
import { RouterfyGateway } from 'src/infrastructure/gateways/routerfy/routerfy.gateway';
import { TwentyBusinessUnitRepository } from 'src/infrastructure/persistence/twenty-business-unit.repository';
import { TwentyContractRepository } from 'src/infrastructure/persistence/twenty-contract.repository';
import { TwentyCrmDirectory } from 'src/infrastructure/persistence/twenty-crm-directory';
import { TwentyInvoiceRepository } from 'src/infrastructure/persistence/twenty-invoice.repository';
import { KvCredentialVault } from 'src/infrastructure/vault/kv-credential.vault';
import { KvEventDeduplication } from 'src/infrastructure/vault/kv-event-deduplication';
import { KvWebhookRegistry } from 'src/infrastructure/vault/kv-webhook-registry';
import {
  fingerprintOf,
  systemClock,
  uuidIdentifierGenerator,
} from 'src/infrastructure/system/system-services';
import { type GatewayProvider } from 'src/core/domain/entities/business-unit.entity';

/**
 * Onde as portas encontram os adaptadores.
 *
 * E o unico lugar do modulo que sabe, ao mesmo tempo, que existe um core e que
 * existe uma Routerfy. Quando entrar o segundo gateway, o `gatewayFor` abaixo
 * ganha um caso e nada mais no modulo muda.
 */
const gatewaysByProvider: Record<GatewayProvider, () => PaymentGatewayPort> = {
  ROUTERFY: () => new RouterfyGateway(),
};

export const gatewayFor = (provider: GatewayProvider): PaymentGatewayPort =>
  gatewaysByProvider[provider]();

export const buildContainer = (provider: GatewayProvider = 'ROUTERFY') => {
  const client = new CoreApiClient({ runAs: 'application' });

  return {
    businessUnits: new TwentyBusinessUnitRepository(client),
    contracts: new TwentyContractRepository(client),
    invoices: new TwentyInvoiceRepository(client),
    directory: new TwentyCrmDirectory(client),
    vault: new KvCredentialVault(),
    webhooks: new KvWebhookRegistry(),
    deduplication: new KvEventDeduplication(),
    gateway: gatewayFor(provider),
    clock: systemClock,
    identifiers: uuidIdentifierGenerator,
    fingerprint: fingerprintOf,
  };
};

export type Container = ReturnType<typeof buildContainer>;
