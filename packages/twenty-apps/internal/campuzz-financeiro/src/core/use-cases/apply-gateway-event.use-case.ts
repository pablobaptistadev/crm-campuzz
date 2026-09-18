import { contractIdentifierFrom } from 'src/core/domain/value-objects/contract-identifier.value-object';
import { type BusinessUnitRepositoryPort } from 'src/core/ports/business-unit-repository.port';
import { type ContractRepositoryPort } from 'src/core/ports/contract-repository.port';
import { type CredentialVaultPort } from 'src/core/ports/credential-vault.port';
import { type EventDeduplicationPort } from 'src/core/ports/event-deduplication.port';
import { type InvoiceRepositoryPort } from 'src/core/ports/invoice-repository.port';
import { type PaymentGatewayPort } from 'src/core/ports/payment-gateway.port';

export type ApplyGatewayEventDependencies = {
  businessUnits: BusinessUnitRepositoryPort;
  contracts: ContractRepositoryPort;
  invoices: InvoiceRepositoryPort;
  vault: CredentialVaultPort;
  gateway: PaymentGatewayPort;
  deduplication: EventDeduplicationPort;
};

/**
 * O que sobrou de util no payload depois que paramos de confiar nele.
 *
 * So tres coisas: um id de evento (para nao aplicar duas vezes) e os ids que
 * dizem QUAL contrato mudou. Valor, status e datas vem da releitura, nunca daqui.
 */
export type GatewayEventEnvelope = {
  eventId: string;
  subscriptionId: string | null;
  transactionId: string | null;
};

export type ApplyGatewayEventInput = {
  businessUnitId: string;
  event: GatewayEventEnvelope;
};

export type ApplyGatewayEventOutcome =
  | { applied: false; reason: 'DUPLICATE' | 'UNKNOWN_CONTRACT' | 'FOREIGN_BUSINESS_UNIT' | 'NO_IDENTIFIER' | 'CREDENTIAL_MISSING' | 'GONE_FROM_GATEWAY' }
  | { applied: true; contractId: string; invoiceCount: number };

/**
 * Aplica um evento do gateway relendo a verdade na API.
 *
 * A Routerfy nao assina as entregas. Sem assinatura, o corpo do webhook nao e
 * fonte de verdade — e so um aviso de que algo mudou. Entao daqui saem tres
 * garantias:
 *
 * 1. **dedup**: reentrega do gateway nao duplica fatura. O Campuzz grava
 *    `webhooks.event_id` e nunca consulta, e por isso reprocessar la cobra o
 *    efeito duas vezes;
 * 2. **releitura**: o que vai para o banco e o que a API respondeu, com as chaves
 *    da BU. Um POST forjado no maximo nos faz gastar uma chamada legitima;
 * 3. **isolamento por BU**: o contrato so e atualizado se pertence a BU por onde
 *    o evento entrou. Sem isso, quem tem uma BU conseguiria mexer no contrato de
 *    outra so acertando o id.
 */
export const applyGatewayEvent = async (
  {
    businessUnits,
    contracts,
    invoices,
    vault,
    gateway,
    deduplication,
  }: ApplyGatewayEventDependencies,
  input: ApplyGatewayEventInput,
): Promise<ApplyGatewayEventOutcome> => {
  if (await deduplication.hasBeenApplied(input.event.eventId)) {
    return { applied: false, reason: 'DUPLICATE' };
  }

  const identifierValue =
    input.event.subscriptionId ?? input.event.transactionId;

  if (identifierValue === null) {
    return { applied: false, reason: 'NO_IDENTIFIER' };
  }

  const stored = await contracts.findByExternalIds({
    subscriptionId: input.event.subscriptionId,
    transactionId: input.event.transactionId,
  });

  if (stored === null) {
    // Contrato que o CRM nunca vinculou. Marcamos como aplicado para a reentrega
    // nao ficar batendo de graca no gateway a cada retry.
    await deduplication.markAsApplied(input.event.eventId);

    return { applied: false, reason: 'UNKNOWN_CONTRACT' };
  }

  if (stored.businessUnitId !== input.businessUnitId) {
    return { applied: false, reason: 'FOREIGN_BUSINESS_UNIT' };
  }

  const businessUnit = await businessUnits.findById(input.businessUnitId);
  const credential =
    businessUnit === null ? null : await vault.read(businessUnit.id);

  if (credential === null) {
    return { applied: false, reason: 'CREDENTIAL_MISSING' };
  }

  const fresh = await gateway.findContractByIdentifier(
    contractIdentifierFrom(identifierValue),
    credential,
  );

  if (fresh === null) {
    return { applied: false, reason: 'GONE_FROM_GATEWAY' };
  }

  await contracts.updateFromGateway(stored.id, fresh);
  await invoices.upsertForContract(stored.id, fresh.invoices);
  await deduplication.markAsApplied(input.event.eventId);

  return {
    applied: true,
    contractId: stored.id,
    invoiceCount: fresh.invoices.length,
  };
};
