import { type StoredContract } from 'src/financeiro/core/domain/entities/gateway-contract.entity';
import { duplicateContract } from 'src/financeiro/core/domain/errors/financeiro.error';
import { type ContractRepositoryPort } from 'src/financeiro/core/ports/contract-repository.port';
import { type InvoiceRepositoryPort } from 'src/financeiro/core/ports/invoice-repository.port';
import {
  previewContract,
  type PreviewContractDependencies,
  type PreviewContractInput,
} from 'src/financeiro/core/use-cases/preview-contract.use-case';

export type AttachContractDependencies = PreviewContractDependencies & {
  contracts: ContractRepositoryPort;
  invoices: InvoiceRepositoryPort;
};

export type AttachContractInput = PreviewContractInput;

export type AttachContractOutput = {
  contract: StoredContract;
  invoiceCount: number;
};

/**
 * Vincula o contrato ao registro e traz as faturas junto.
 *
 * Revalida tudo em vez de confiar no preview que o front ja fez: entre o passo 2
 * e o clique de confirmar, outra pessoa pode ter vinculado o mesmo contrato, e o
 * gateway pode ter mudado o titular. O preview serve para a pessoa decidir; a
 * decisao so vale contra o estado do momento em que grava.
 */
export const attachContract = async (
  dependencies: AttachContractDependencies,
  input: AttachContractInput,
): Promise<AttachContractOutput> => {
  const preview = await previewContract(dependencies, input);

  if (preview.alreadyLinkedContractId !== null) {
    throw duplicateContract();
  }

  const stored = await dependencies.contracts.create({
    businessUnitId: preview.businessUnit.id,
    holder: input.holder,
    contract: preview.contract,
  });

  await dependencies.invoices.upsertForContract(
    stored.id,
    preview.contract.invoices,
  );

  return { contract: stored, invoiceCount: preview.contract.invoices.length };
};
