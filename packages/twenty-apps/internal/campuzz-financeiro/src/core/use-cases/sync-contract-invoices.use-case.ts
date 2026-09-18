import {
  reconcileContracts,
  type ReconcileDependencies,
  type ReconcileOutput,
} from 'src/core/use-cases/reconcile-contracts';

export type SyncContractInvoicesDependencies = ReconcileDependencies;

export type SyncContractInvoicesOutput = ReconcileOutput;

/**
 * Rede de seguranca do webhook, varrendo todos os contratos vivos.
 *
 * Entrega de webhook nao e garantida, e a Routerfy nao assina nem garante
 * reenvio. Sem esta passada, uma fatura paga cujo evento se perdeu fica "a
 * pagar" na tela para sempre — e a aba passa a mentir sem avisar.
 */
export const syncContractInvoices = async (
  dependencies: SyncContractInvoicesDependencies,
): Promise<SyncContractInvoicesOutput> =>
  reconcileContracts(dependencies, await dependencies.contracts.listActive());
