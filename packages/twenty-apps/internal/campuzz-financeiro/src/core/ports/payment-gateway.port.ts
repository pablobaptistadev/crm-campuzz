import {
  type GatewayCredential,
  type GatewayProvider,
} from 'src/core/domain/entities/business-unit.entity';
import { type GatewayContract } from 'src/core/domain/entities/gateway-contract.entity';
import { type ContractIdentifier } from 'src/core/domain/value-objects/contract-identifier.value-object';

/**
 * O contrato minimo que qualquer gateway de pagamento cumpre.
 *
 * E a costura do modulo: a Routerfy e a primeira implementacao, e o proximo
 * gateway entra como outro adaptador em src/infrastructure/gateways sem que
 * nenhum caso de uso mude. Por isso nada aqui fala de `x-api-key`, de checkout
 * ou de qualquer nome que so exista na Routerfy.
 */
export type PaymentGatewayPort = {
  readonly provider: GatewayProvider;

  /** Responde se o par de chaves e aceito. Nao lanca por credencial errada. */
  validateCredentials(credential: GatewayCredential): Promise<boolean>;

  /**
   * Acha o contrato pelo que a pessoa digitou — numero do painel ou id interno.
   * Devolve null quando nao existe; lanca so quando o gateway falhou.
   */
  findContractByIdentifier(
    identifier: ContractIdentifier,
    credential: GatewayCredential,
  ): Promise<GatewayContract | null>;

  /** Registra a URL de webhook e devolve o id do registro no gateway. */
  registerWebhook(
    webhookUrl: string,
    credential: GatewayCredential,
  ): Promise<string>;

  removeWebhook(
    webhookRegistrationId: string,
    credential: GatewayCredential,
  ): Promise<void>;
};
