import {
  type ContractHolder,
  type GatewayContract,
  type StoredContract,
} from 'src/core/domain/entities/gateway-contract.entity';

export type ContractDraft = {
  businessUnitId: string;
  holder: ContractHolder;
  contract: GatewayContract;
};

export type ContractRepositoryPort = {
  /**
   * Procura por qualquer um dos dois ids externos.
   *
   * E a trava de duplicata: o mesmo contrato nao pode nascer duas vezes, nem
   * como assinatura nem como transacao.
   */
  findByExternalIds(params: {
    subscriptionId: string | null;
    transactionId: string | null;
  }): Promise<StoredContract | null>;

  findById(contractId: string): Promise<StoredContract | null>;

  listActive(): Promise<readonly StoredContract[]>;

  /** Os contratos de um clube ou de um membro, para a aba Financeiro dele. */
  listByHolder(holder: ContractHolder): Promise<readonly StoredContract[]>;

  create(draft: ContractDraft): Promise<StoredContract>;

  updateFromGateway(
    contractId: string,
    contract: GatewayContract,
  ): Promise<void>;
};
