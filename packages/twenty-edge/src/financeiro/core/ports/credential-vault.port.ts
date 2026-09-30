import { type GatewayCredential } from 'src/financeiro/core/domain/entities/business-unit.entity';

/**
 * Onde as chaves moram.
 *
 * Existe como porta para as chaves nunca virarem campo de objeto: campo de
 * objeto sai pela API GraphQL para qualquer pessoa com leitura, que e o furo que
 * a integracao do Campuzz tem hoje (`integrations.api_key` em texto puro).
 */
export type CredentialVaultPort = {
  read(businessUnitId: string): Promise<GatewayCredential | null>;
  write(businessUnitId: string, credential: GatewayCredential): Promise<void>;
  erase(businessUnitId: string): Promise<void>;
};
