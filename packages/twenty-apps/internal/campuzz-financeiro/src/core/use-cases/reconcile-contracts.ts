import { type StoredContract } from 'src/core/domain/entities/gateway-contract.entity';
import { contractIdentifierFrom } from 'src/core/domain/value-objects/contract-identifier.value-object';
import { type ContractRepositoryPort } from 'src/core/ports/contract-repository.port';
import { type CredentialVaultPort } from 'src/core/ports/credential-vault.port';
import { type InvoiceRepositoryPort } from 'src/core/ports/invoice-repository.port';
import { type PaymentGatewayPort } from 'src/core/ports/payment-gateway.port';

export type ReconcileDependencies = {
  contracts: ContractRepositoryPort;
  invoices: InvoiceRepositoryPort;
  vault: CredentialVaultPort;
  gateway: PaymentGatewayPort;
};

export type ReconcileOutput = {
  reconciled: number;
  skipped: number;
};

/**
 * Rele uma lista de contratos no gateway e grava o que a API respondeu.
 *
 * Vive fora dos dois casos de uso que a chamam — a varredura noturna e o painel
 * do registro — porque a regra e a mesma nos dois: o que muda e so QUAIS
 * contratos entram. Ter duas copias dela significaria consertar bug em dois
 * lugares e esquecer um.
 *
 * Um contrato que falha nao derruba os outros: o erro dele conta em `skipped` e
 * a passada continua.
 */
export const reconcileContracts = async (
  { contracts, invoices, vault, gateway }: ReconcileDependencies,
  candidates: readonly StoredContract[],
): Promise<ReconcileOutput> => {
  let reconciled = 0;
  let skipped = 0;

  for (const stored of candidates) {
    const identifierValue =
      stored.externalSubscriptionId ?? stored.externalTransactionId;

    if (identifierValue === null) {
      skipped += 1;
      continue;
    }

    try {
      const credential = await vault.read(stored.businessUnitId);

      if (credential === null) {
        skipped += 1;
        continue;
      }

      const fresh = await gateway.findContractByIdentifier(
        contractIdentifierFrom(identifierValue),
        credential,
      );

      if (fresh === null) {
        skipped += 1;
        continue;
      }

      await contracts.updateFromGateway(stored.id, fresh);
      await invoices.upsertForContract(stored.id, fresh.invoices);
      reconciled += 1;
    } catch {
      skipped += 1;
    }
  }

  return { reconciled, skipped };
};
