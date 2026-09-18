import { kv } from 'twenty-sdk/logic-function';

import {
  type WebhookClaim,
  type WebhookRegistryPort,
} from 'src/core/ports/webhook-registry.port';
import { registrationClaimKey } from 'src/infrastructure/vault/kv-keys';

/**
 * O mapa registrationId -> (workspace, BU), em escopo de SERVIDOR.
 *
 * Precisa ser de servidor porque o resolver roda antes de saber em qual
 * workspace esta: a URL do webhook so carrega o registrationId. Mesmo padrao do
 * app do Granola.
 */
export class KvWebhookRegistry implements WebhookRegistryPort {
  async claim(registrationId: string, claim: WebhookClaim): Promise<void> {
    await kv.set(registrationClaimKey(registrationId), claim, {
      scope: 'SERVER',
    });
  }

  async resolve(registrationId: string): Promise<WebhookClaim | null> {
    return await kv.get<WebhookClaim>(registrationClaimKey(registrationId), {
      scope: 'SERVER',
    });
  }

  async release(registrationId: string): Promise<void> {
    await kv.delete(registrationClaimKey(registrationId), { scope: 'SERVER' });
  }
}
