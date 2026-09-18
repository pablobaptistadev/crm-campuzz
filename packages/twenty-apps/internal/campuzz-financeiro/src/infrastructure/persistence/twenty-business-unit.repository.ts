import {
  type BusinessUnit,
  type BusinessUnitStatus,
  type GatewayProvider,
} from 'src/core/domain/entities/business-unit.entity';
import {
  type BusinessUnitDraft,
  type BusinessUnitRepositoryPort,
} from 'src/core/ports/business-unit-repository.port';
import {
  allNodes,
  BUSINESS_UNIT_SELECTION,
  type BusinessUnitRecord,
  type Connection,
  firstNode,
  type ReadWriteClient,
} from 'src/infrastructure/persistence/record-shapes';

const PAGE_SIZE = 200;

const toDomain = (record: BusinessUnitRecord): BusinessUnit => ({
  id: record.id,
  name: record.name ?? '',
  gatewayProvider: (record.gatewayProvider ?? 'ROUTERFY') as GatewayProvider,
  apiKeyPreview: record.apiKeyPreview ?? '',
  keyFingerprint: record.keyFingerprint ?? '',
  webhookRegistrationId: record.webhookRegistrationId,
  gatewayWebhookId: record.gatewayWebhookId,
  connectionStatus: (record.connectionStatus ?? 'PENDING') as BusinessUnitStatus,
  lastValidatedAt: record.lastValidatedAt,
  isDefault: record.isDefault ?? false,
});

export class TwentyBusinessUnitRepository implements BusinessUnitRepositoryPort {
  constructor(private readonly client: ReadWriteClient) {}

  async findById(businessUnitId: string): Promise<BusinessUnit | null> {
    const result: { businessUnits?: Connection<BusinessUnitRecord> } =
      await this.client.query({
        businessUnits: {
          __args: { filter: { id: { eq: businessUnitId } }, first: 1 },
          edges: { node: BUSINESS_UNIT_SELECTION },
        },
      });

    const record = firstNode(result.businessUnits);

    return record === null ? null : toDomain(record);
  }

  /**
   * A BU padrao, com desempate por id.
   *
   * O `orderBy` nao e detalhe: se duas BUs ficassem marcadas como padrao, sem
   * ordem definida a resolucao passaria a depender do humor do banco. E o mesmo
   * problema que o Campuzz tem ao escolher a integracao ativa com um `find` sem
   * ordenacao (enrollment.service.ts:65) — la, qual credencial atende uma
   * matricula e indeterminado.
   */
  async findDefault(): Promise<BusinessUnit | null> {
    const result: { businessUnits?: Connection<BusinessUnitRecord> } =
      await this.client.query({
        businessUnits: {
          __args: {
            filter: { isDefault: { eq: true } },
            orderBy: [{ id: 'AscNullsLast' }],
            first: 1,
          },
          edges: { node: BUSINESS_UNIT_SELECTION },
        },
      });

    const record = firstNode(result.businessUnits);

    return record === null ? null : toDomain(record);
  }

  async findByCompanyId(companyId: string): Promise<BusinessUnit | null> {
    const result: {
      companies?: Connection<{ businessUnitId: string | null }>;
    } = await this.client.query({
      companies: {
        __args: { filter: { id: { eq: companyId } }, first: 1 },
        edges: { node: { businessUnitId: true } },
      },
    });

    const businessUnitId = firstNode(result.companies)?.businessUnitId ?? null;

    return businessUnitId === null ? null : this.findById(businessUnitId);
  }

  async findByPersonId(personId: string): Promise<BusinessUnit | null> {
    const result: { people?: Connection<{ businessUnitId: string | null }> } =
      await this.client.query({
        people: {
          __args: { filter: { id: { eq: personId } }, first: 1 },
          edges: { node: { businessUnitId: true } },
        },
      });

    const businessUnitId = firstNode(result.people)?.businessUnitId ?? null;

    return businessUnitId === null ? null : this.findById(businessUnitId);
  }

  async listAll(): Promise<readonly BusinessUnit[]> {
    const result: { businessUnits?: Connection<BusinessUnitRecord> } =
      await this.client.query({
        businessUnits: {
          __args: { first: PAGE_SIZE, orderBy: [{ name: 'AscNullsLast' }] },
          edges: { node: BUSINESS_UNIT_SELECTION },
        },
      });

    return allNodes(result.businessUnits).map(toDomain);
  }

  async save(draft: BusinessUnitDraft): Promise<BusinessUnit> {
    const data = {
      name: draft.name,
      gatewayProvider: draft.gatewayProvider,
      apiKeyPreview: draft.apiKeyPreview,
      keyFingerprint: draft.keyFingerprint,
      webhookRegistrationId: draft.webhookRegistrationId,
      gatewayWebhookId: draft.gatewayWebhookId,
      connectionStatus: draft.connectionStatus,
      lastValidatedAt: draft.lastValidatedAt,
      isDefault: draft.isDefault,
    };

    if (draft.id !== undefined) {
      const updated: { updateBusinessUnit?: BusinessUnitRecord } =
        await this.client.mutation({
          updateBusinessUnit: {
            __args: { id: draft.id, data },
            ...BUSINESS_UNIT_SELECTION,
          },
        });

      if (updated.updateBusinessUnit === undefined) {
        throw new Error('Nao conseguimos salvar as alteracoes desta BU.');
      }

      return toDomain(updated.updateBusinessUnit);
    }

    const created: { createBusinessUnit?: BusinessUnitRecord } =
      await this.client.mutation({
        createBusinessUnit: {
          __args: { data },
          ...BUSINESS_UNIT_SELECTION,
        },
      });

    if (created.createBusinessUnit === undefined) {
      throw new Error('Nao conseguimos cadastrar esta BU.');
    }

    return toDomain(created.createBusinessUnit);
  }

  async clearDefaultExcept(businessUnitId: string): Promise<void> {
    const result: { businessUnits?: Connection<{ id: string }> } =
      await this.client.query({
        businessUnits: {
          __args: {
            filter: { isDefault: { eq: true }, id: { neq: businessUnitId } },
            first: PAGE_SIZE,
          },
          edges: { node: { id: true } },
        },
      });

    for (const record of allNodes(result.businessUnits)) {
      await this.client.mutation({
        updateBusinessUnit: {
          __args: { id: record.id, data: { isDefault: false } },
          id: true,
        },
      });
    }
  }
}
