import {
  type GatewayCredential,
  type GatewayProvider,
} from 'src/financeiro/core/domain/entities/business-unit.entity';
import { type GatewayContract } from 'src/financeiro/core/domain/entities/gateway-contract.entity';
import { type ContractIdentifier } from 'src/financeiro/core/domain/value-objects/contract-identifier.value-object';
import { type PaymentGatewayPort } from 'src/financeiro/core/ports/payment-gateway.port';
import {
  mapSubscription,
  mapTransaction,
} from 'src/financeiro/gateways/routerfy/routerfy-contract.mapper';
import {
  type RouterfyListPayload,
  type RouterfySubscriptionPayload,
  type RouterfyTransactionPayload,
  unwrapList,
} from 'src/financeiro/gateways/routerfy/routerfy-payload.types';
import { routerfyRequest } from 'src/financeiro/gateways/routerfy/routerfy-http.client';

const encode = (value: string): string => encodeURIComponent(value);

/**
 * A Routerfy como implementacao de PaymentGatewayPort.
 *
 * Tudo que e especifico dela — headers de duas chaves, o par assinatura/transacao,
 * o formato de lista que ora vem embrulhado ora nao — para neste arquivo. Nenhum
 * caso de uso sabe que existe uma Routerfy, e e isso que permite o proximo
 * gateway entrar como um irmao deste diretorio.
 */
export class RouterfyGateway implements PaymentGatewayPort {
  readonly provider: GatewayProvider = 'ROUTERFY';

  async validateCredentials(credential: GatewayCredential): Promise<boolean> {
    try {
      const response = await routerfyRequest('/v1/customers', credential);

      return response.status >= 200 && response.status < 300;
    } catch {
      // Credencial recusada e credencial que nao deu para testar levam a mesma
      // acao de quem esta cadastrando: conferir e tentar de novo. Distinguir as
      // duas aqui nao mudaria nada na tela.
      return false;
    }
  }

  /**
   * Acha o contrato pelo que a pessoa digitou.
   *
   * Quatro tentativas, nesta ordem: assinatura por id, assinatura por code,
   * transacao por id, transacao por code. Recorrencia vem antes porque e o caso
   * comum, e porque so ela traz a lista de faturas.
   *
   * O Campuzz tenta seis porque intercala os endpoints `/v1/internal/*`, que
   * exigem um token de instancia que o CRM nao tem — e nao precisa: o endpoint
   * por conta ja devolve `invoices[]` (e por isso que `enrollment.service.ts:183`
   * refaz a busca por ele "pra ter items[], invoices[], etc").
   */
  async findContractByIdentifier(
    identifier: ContractIdentifier,
    credential: GatewayCredential,
  ): Promise<GatewayContract | null> {
    const subscriptionById =
      await routerfyRequest<RouterfySubscriptionPayload>(
        `/v1/subscriptions/${encode(identifier.value)}`,
        credential,
      );

    if (subscriptionById.body != null) {
      return mapSubscription(subscriptionById.body);
    }

    const subscriptionByCode = await this.searchSubscriptionByCode(
      identifier.value,
      credential,
    );

    if (subscriptionByCode !== null) {
      return subscriptionByCode;
    }

    const transactionById = await routerfyRequest<RouterfyTransactionPayload>(
      `/v1/transactions/${encode(identifier.value)}`,
      credential,
    );

    if (transactionById.body != null) {
      return mapTransaction(transactionById.body);
    }

    return this.searchTransactionByCode(identifier.value, credential);
  }

  async registerWebhook(
    webhookUrl: string,
    credential: GatewayCredential,
  ): Promise<string> {
    const response = await routerfyRequest<{
      id?: string;
      data?: { id?: string };
    }>('/v1/webhook', credential, {
      method: 'POST',
      body: { name: 'Campuzz CRM', url: webhookUrl },
    });

    const registrationId = response.body?.data?.id ?? response.body?.id ?? null;

    if (registrationId === null) {
      throw new Error(
        'A Routerfy aceitou o webhook mas nao devolveu um id de registro.',
      );
    }

    return registrationId;
  }

  async removeWebhook(
    webhookRegistrationId: string,
    credential: GatewayCredential,
  ): Promise<void> {
    await routerfyRequest(
      `/v1/webhook/${encode(webhookRegistrationId)}`,
      credential,
      { method: 'DELETE' },
    );
  }

  private async searchSubscriptionByCode(
    code: string,
    credential: GatewayCredential,
  ): Promise<GatewayContract | null> {
    const response = await routerfyRequest<
      RouterfyListPayload<RouterfySubscriptionPayload>
    >(`/v1/subscriptions?code=${encode(code)}`, credential);

    const match = unwrapList(response.body).find(
      (candidate) => candidate.code === code || candidate.id === code,
    );

    if (match?.id == null) {
      return null;
    }

    // A lista vem resumida, sem `invoices[]`. Buscamos o detalhe para o
    // financeiro nascer completo; se o detalhe falhar, o resumo ainda vale mais
    // que nada.
    const detailed = await routerfyRequest<RouterfySubscriptionPayload>(
      `/v1/subscriptions/${encode(match.id)}`,
      credential,
    ).catch(() => null);

    return mapSubscription(detailed?.body ?? match);
  }

  private async searchTransactionByCode(
    code: string,
    credential: GatewayCredential,
  ): Promise<GatewayContract | null> {
    const response = await routerfyRequest<
      RouterfyListPayload<RouterfyTransactionPayload>
    >(`/v1/transactions?code=${encode(code)}`, credential);

    const match = unwrapList(response.body).find(
      (candidate) => candidate.code === code || candidate.id === code,
    );

    return match === undefined ? null : mapTransaction(match);
  }
}
