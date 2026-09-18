import {
  type ContractHolder,
  type StoredContract,
} from 'src/core/domain/entities/gateway-contract.entity';
import {
  reconcileContracts,
  type ReconcileDependencies,
} from 'src/core/use-cases/reconcile-contracts';

export type SyncHolderContractsDependencies = ReconcileDependencies;

export type SyncHolderContractsOutput = {
  reconciled: number;
  skipped: number;
  contracts: readonly StoredContract[];
};

/**
 * Rele so os contratos de um registro.
 *
 * E o que a aba Financeiro chama ao abrir. Existe separado da varredura noturna
 * porque o recorte muda tudo: aqui sao poucos contratos e alguem esperando na
 * tela, la sao todos e ninguem olhando.
 *
 * Um registro sem contrato nenhum nao e caso de erro — e o estado normal de quem
 * ainda nao vinculou. Devolve zerado e a aba mostra o vazio.
 */
export const syncHolderContracts = async (
  dependencies: SyncHolderContractsDependencies,
  holder: ContractHolder,
): Promise<SyncHolderContractsOutput> => {
  const contracts = await dependencies.contracts.listByHolder(holder);
  const result = await reconcileContracts(dependencies, contracts);

  return { ...result, contracts };
};
