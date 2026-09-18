import { kv } from 'twenty-sdk/logic-function';

import { type GatewayCredential } from 'src/core/domain/entities/business-unit.entity';
import { type CredentialVaultPort } from 'src/core/ports/credential-vault.port';
import { credentialKey } from 'src/infrastructure/vault/kv-keys';

/**
 * As chaves da BU, guardadas fora do registro.
 *
 * O kv so e alcancavel de dentro de uma logic function. Um campo de objeto, nao:
 * sairia pela API GraphQL para qualquer pessoa com leitura no objeto. E a
 * diferenca entre isto e `integrations.api_key` do Campuzz, que fica em texto
 * puro numa coluna e depende de cada endpoint lembrar de apagar o campo na
 * resposta.
 */
export class KvCredentialVault implements CredentialVaultPort {
  async read(businessUnitId: string): Promise<GatewayCredential | null> {
    return await kv.get<GatewayCredential>(credentialKey(businessUnitId));
  }

  async write(
    businessUnitId: string,
    credential: GatewayCredential,
  ): Promise<void> {
    await kv.set(credentialKey(businessUnitId), credential);
  }

  async erase(businessUnitId: string): Promise<void> {
    await kv.delete(credentialKey(businessUnitId));
  }
}
