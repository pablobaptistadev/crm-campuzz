import {
  type ContractHolder,
  type GatewayContract,
  type StoredContract,
} from 'src/core/domain/entities/gateway-contract.entity';
import {
  type ContractDraft,
  type ContractRepositoryPort,
} from 'src/core/ports/contract-repository.port';
import { totalValueOf } from 'src/infrastructure/gateways/routerfy/routerfy-contract.mapper';
import {
  allNodes,
  CONTRACT_SELECTION,
  type Connection,
  firstNode,
  type GatewayContractRecord,
  type ReadWriteClient,
} from 'src/infrastructure/persistence/record-shapes';

const PAGE_SIZE = 200;

/**
 * Status de contrato que ainda merecem releitura periodica.
 *
 * Contrato cancelado ou encerrado nao muda mais, entao relê-lo a cada rodada do
 * cron so gasta chamada no gateway.
 */
const LIVE_STATUSES = ['active', 'trialing', 'past_due', 'unpaid', 'pending'];

const toDomain = (record: GatewayContractRecord): StoredContract => ({
  id: record.id,
  externalSubscriptionId: record.externalSubscriptionId,
  externalTransactionId: record.externalTransactionId,
  businessUnitId: record.businessUnitId ?? '',
  holder:
    record.companyId !== null
      ? { type: 'COMPANY', recordId: record.companyId }
      : { type: 'PERSON', recordId: record.personId ?? '' },
});

const holderData = (holder: ContractHolder) =>
  holder.type === 'COMPANY'
    ? { companyId: holder.recordId }
    : { personId: holder.recordId };

const contractData = (contract: GatewayContract) => ({
  name: contract.code ?? contract.subscriptionId ?? contract.transactionId,
  externalSubscriptionId: contract.subscriptionId,
  externalTransactionId: contract.transactionId,
  contractKind: contract.kind,
  contractStatus: contract.status,
  amount: contract.amount,
  totalValue: totalValueOf(contract),
  frequency: contract.frequency,
  frequencyInterval: contract.frequencyInterval,
  startsAt: contract.startsAt,
  endsAt: contract.endsAt,
  nextChargeAt: contract.nextChargeAt,
  paidInvoicesCount: contract.invoices.filter(
    (invoice) => invoice.status.trim().toLowerCase() === 'paid',
  ).length,
  paymentMethod: contract.paymentMethod,
  customerEmail: contract.customer.email,
  customerDocument: contract.customer.document,
});

export class TwentyContractRepository implements ContractRepositoryPort {
  constructor(private readonly client: ReadWriteClient) {}

  /**
   * Procura pelos dois ids de uma vez.
   *
   * O `or` importa: uma recorrencia e achada pelo subscriptionId e uma venda a
   * vista pelo transactionId, e a trava de duplicata precisa pegar as duas sem o
   * chamador saber de antemao qual dos dois veio preenchido.
   */
  async findByExternalIds(params: {
    subscriptionId: string | null;
    transactionId: string | null;
  }): Promise<StoredContract | null> {
    const clauses = [
      params.subscriptionId === null
        ? null
        : { externalSubscriptionId: { eq: params.subscriptionId } },
      params.transactionId === null
        ? null
        : { externalTransactionId: { eq: params.transactionId } },
    ].filter((clause) => clause !== null);

    if (clauses.length === 0) {
      return null;
    }

    const result: { gatewayContracts?: Connection<GatewayContractRecord> } =
      await this.client.query({
        gatewayContracts: {
          __args: { filter: { or: clauses }, first: 1 },
          edges: { node: CONTRACT_SELECTION },
        },
      });

    const record = firstNode(result.gatewayContracts);

    return record === null ? null : toDomain(record);
  }

  async findById(contractId: string): Promise<StoredContract | null> {
    const result: { gatewayContracts?: Connection<GatewayContractRecord> } =
      await this.client.query({
        gatewayContracts: {
          __args: { filter: { id: { eq: contractId } }, first: 1 },
          edges: { node: CONTRACT_SELECTION },
        },
      });

    const record = firstNode(result.gatewayContracts);

    return record === null ? null : toDomain(record);
  }

  async listActive(): Promise<readonly StoredContract[]> {
    const result: { gatewayContracts?: Connection<GatewayContractRecord> } =
      await this.client.query({
        gatewayContracts: {
          __args: {
            filter: { contractStatus: { in: LIVE_STATUSES } },
            first: PAGE_SIZE,
            orderBy: [{ id: 'AscNullsLast' }],
          },
          edges: { node: CONTRACT_SELECTION },
        },
      });

    return allNodes(result.gatewayContracts).map(toDomain);
  }

  async listByHolder(
    holder: ContractHolder,
  ): Promise<readonly StoredContract[]> {
    const filter =
      holder.type === 'COMPANY'
        ? { companyId: { eq: holder.recordId } }
        : { personId: { eq: holder.recordId } };

    const result: { gatewayContracts?: Connection<GatewayContractRecord> } =
      await this.client.query({
        gatewayContracts: {
          __args: { filter, first: PAGE_SIZE, orderBy: [{ id: 'AscNullsLast' }] },
          edges: { node: CONTRACT_SELECTION },
        },
      });

    return allNodes(result.gatewayContracts).map(toDomain);
  }

  async create(draft: ContractDraft): Promise<StoredContract> {
    const created: { createGatewayContract?: GatewayContractRecord } =
      await this.client.mutation({
        createGatewayContract: {
          __args: {
            data: {
              ...contractData(draft.contract),
              ...holderData(draft.holder),
              businessUnitId: draft.businessUnitId,
            },
          },
          ...CONTRACT_SELECTION,
        },
      });

    if (created.createGatewayContract === undefined) {
      throw new Error('Nao conseguimos gravar este contrato.');
    }

    return toDomain(created.createGatewayContract);
  }

  /**
   * Atualiza o contrato com o que a API respondeu.
   *
   * O titular e a BU ficam de fora de proposito: quem decide a quem o contrato
   * pertence e quem vinculou, na tela. Um evento do gateway nao pode mover um
   * contrato para outro registro.
   */
  async updateFromGateway(
    contractId: string,
    contract: GatewayContract,
  ): Promise<void> {
    await this.client.mutation({
      updateGatewayContract: {
        __args: { id: contractId, data: contractData(contract) },
        id: true,
      },
    });
  }
}
