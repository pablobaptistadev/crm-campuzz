import {
  type BusinessUnit,
  type GatewayCredential,
} from 'src/financeiro/core/domain/entities/business-unit.entity';
import {
  type ContractHolder,
  type GatewayContract,
  type GatewayInvoice,
  type StoredContract,
} from 'src/financeiro/core/domain/entities/gateway-contract.entity';
import {
  type BusinessUnitDraft,
  type BusinessUnitRepositoryPort,
} from 'src/financeiro/core/ports/business-unit-repository.port';
import { type ClockPort } from 'src/financeiro/core/ports/clock.port';
import {
  type ContractDraft,
  type ContractRepositoryPort,
} from 'src/financeiro/core/ports/contract-repository.port';
import { type CredentialVaultPort } from 'src/financeiro/core/ports/credential-vault.port';
import {
  type CrmDirectoryPort,
  type HolderContact,
} from 'src/financeiro/core/ports/crm-directory.port';
import { type EventDeduplicationPort } from 'src/financeiro/core/ports/event-deduplication.port';
import { type IdentifierGeneratorPort } from 'src/financeiro/core/ports/identifier-generator.port';
import {
  type InvoiceRepositoryPort,
  type InvoiceSummary,
} from 'src/financeiro/core/ports/invoice-repository.port';
import { type PaymentGatewayPort } from 'src/financeiro/core/ports/payment-gateway.port';
import {
  type WebhookClaim,
  type WebhookRegistryPort,
} from 'src/financeiro/core/ports/webhook-registry.port';
import {
  isInvoiceOpen,
  isInvoicePaid,
  invoiceStatusFromGateway,
} from 'src/financeiro/core/domain/value-objects/invoice-status.value-object';
import {
  DEFAULT_CURRENCY_CODE,
  moneyFromUnits,
  sumMoney,
} from 'src/financeiro/core/domain/value-objects/money.value-object';

export const buildBusinessUnit = (
  overrides: Partial<BusinessUnit> = {},
): BusinessUnit => ({
  id: 'bu-1',
  name: 'BU Padrao',
  gatewayProvider: 'ROUTERFY',
  apiKeyPreview: 'abc123...',
  keyFingerprint: 'fingerprint-abc',
  webhookRegistrationId: 'reg-1',
  gatewayWebhookId: 'gw-hook-1',
  connectionStatus: 'ACTIVE',
  lastValidatedAt: '2026-01-01T00:00:00.000Z',
  isDefault: true,
  ...overrides,
});

export const buildGatewayInvoice = (
  overrides: Partial<GatewayInvoice> = {},
): GatewayInvoice => ({
  externalInvoiceId: 'inv-1',
  code: '2026051000000100-1',
  status: 'pending',
  amount: moneyFromUnits(100),
  dueAt: '2026-02-10T00:00:00.000Z',
  paidAt: null,
  paymentUrl: null,
  ...overrides,
});

export const buildGatewayContract = (
  overrides: Partial<GatewayContract> = {},
): GatewayContract => ({
  kind: 'SUBSCRIPTION',
  subscriptionId: 'sub-1',
  transactionId: null,
  code: '2026051000000100',
  status: 'active',
  amount: moneyFromUnits(100),
  frequency: 'month',
  frequencyInterval: 1,
  startsAt: '2026-01-01T00:00:00.000Z',
  endsAt: null,
  nextChargeAt: '2026-02-10T00:00:00.000Z',
  paymentMethod: 'Cartao de credito',
  customer: {
    name: 'Pablo Baptista',
    email: 'contato@exemplo.com.br',
    document: null,
    phone: null,
  },
  invoices: [buildGatewayInvoice()],
  ...overrides,
});

export class FakeBusinessUnitRepository implements BusinessUnitRepositoryPort {
  readonly units = new Map<string, BusinessUnit>();
  readonly byCompany = new Map<string, string>();
  readonly byPerson = new Map<string, string>();
  clearDefaultCalls: string[] = [];

  constructor(units: readonly BusinessUnit[] = []) {
    for (const unit of units) {
      this.units.set(unit.id, unit);
    }
  }

  async findById(businessUnitId: string): Promise<BusinessUnit | null> {
    return this.units.get(businessUnitId) ?? null;
  }

  async findDefault(): Promise<BusinessUnit | null> {
    return [...this.units.values()].find((unit) => unit.isDefault) ?? null;
  }

  async findByCompanyId(companyId: string): Promise<BusinessUnit | null> {
    const id = this.byCompany.get(companyId);

    return id === undefined ? null : (this.units.get(id) ?? null);
  }

  async findByPersonId(personId: string): Promise<BusinessUnit | null> {
    const id = this.byPerson.get(personId);

    return id === undefined ? null : (this.units.get(id) ?? null);
  }

  async listAll(): Promise<readonly BusinessUnit[]> {
    return [...this.units.values()];
  }

  async save(draft: BusinessUnitDraft): Promise<BusinessUnit> {
    const id = draft.id ?? `bu-${this.units.size + 1}`;
    const saved: BusinessUnit = { ...draft, id };

    this.units.set(id, saved);

    return saved;
  }

  async clearDefaultExcept(businessUnitId: string): Promise<void> {
    this.clearDefaultCalls.push(businessUnitId);

    for (const [id, unit] of this.units) {
      if (id !== businessUnitId && unit.isDefault) {
        this.units.set(id, { ...unit, isDefault: false });
      }
    }
  }
}

export class FakeContractRepository implements ContractRepositoryPort {
  readonly stored: StoredContract[] = [];
  readonly updates: { contractId: string; contract: GatewayContract }[] = [];

  constructor(initial: readonly StoredContract[] = []) {
    this.stored.push(...initial);
  }

  async findByExternalIds(params: {
    subscriptionId: string | null;
    transactionId: string | null;
  }): Promise<StoredContract | null> {
    return (
      this.stored.find(
        (candidate) =>
          (params.subscriptionId !== null &&
            candidate.externalSubscriptionId === params.subscriptionId) ||
          (params.transactionId !== null &&
            candidate.externalTransactionId === params.transactionId),
      ) ?? null
    );
  }

  async findById(contractId: string): Promise<StoredContract | null> {
    return this.stored.find((candidate) => candidate.id === contractId) ?? null;
  }

  async listActive(): Promise<readonly StoredContract[]> {
    return this.stored;
  }

  async listByHolder(
    holder: ContractHolder,
  ): Promise<readonly StoredContract[]> {
    return this.stored.filter(
      (candidate) =>
        candidate.holder.type === holder.type &&
        candidate.holder.recordId === holder.recordId,
    );
  }

  async create(draft: ContractDraft): Promise<StoredContract> {
    const created: StoredContract = {
      id: `contract-${this.stored.length + 1}`,
      externalSubscriptionId: draft.contract.subscriptionId,
      externalTransactionId: draft.contract.transactionId,
      businessUnitId: draft.businessUnitId,
      holder: draft.holder,
    };

    this.stored.push(created);

    return created;
  }

  async updateFromGateway(
    contractId: string,
    contract: GatewayContract,
  ): Promise<void> {
    this.updates.push({ contractId, contract });
  }
}

export class FakeInvoiceRepository implements InvoiceRepositoryPort {
  readonly upserts: {
    contractId: string;
    invoices: readonly GatewayInvoice[];
  }[] = [];

  /** O que ficou gravado, casando por externalInvoiceId como o repositorio real. */
  readonly stored = new Map<string, Map<string, GatewayInvoice>>();

  async upsertForContract(
    contractId: string,
    invoices: readonly GatewayInvoice[],
  ): Promise<void> {
    this.upserts.push({ contractId, invoices });

    const byExternalId = this.stored.get(contractId) ?? new Map();

    for (const invoice of invoices) {
      byExternalId.set(invoice.externalInvoiceId, invoice);
    }

    this.stored.set(contractId, byExternalId);
  }

  async summarizeForContracts(
    contractIds: readonly string[],
  ): Promise<InvoiceSummary> {
    const invoices = contractIds.flatMap((contractId) => [
      ...(this.stored.get(contractId)?.values() ?? []),
    ]);

    const open = invoices.filter((invoice) =>
      isInvoiceOpen(invoiceStatusFromGateway(invoice.status)),
    );
    const paid = invoices.filter((invoice) =>
      isInvoicePaid(invoiceStatusFromGateway(invoice.status)),
    );

    const dueDates = open
      .map((invoice) => invoice.dueAt)
      .filter((dueAt): dueAt is string => dueAt !== null)
      .sort();

    return {
      openAmount:
        open.length > 0
          ? sumMoney(open.map((invoice) => invoice.amount))
          : { amountMicros: 0, currencyCode: DEFAULT_CURRENCY_CODE },
      paidAmount:
        paid.length > 0
          ? sumMoney(paid.map((invoice) => invoice.amount))
          : { amountMicros: 0, currencyCode: DEFAULT_CURRENCY_CODE },
      openCount: open.length,
      paidCount: paid.length,
      nextDueAt: dueDates[0] ?? null,
    };
  }
}

export class FakeCredentialVault implements CredentialVaultPort {
  readonly credentials = new Map<string, GatewayCredential>();

  constructor(seed: Record<string, GatewayCredential> = {}) {
    for (const [id, credential] of Object.entries(seed)) {
      this.credentials.set(id, credential);
    }
  }

  async read(businessUnitId: string): Promise<GatewayCredential | null> {
    return this.credentials.get(businessUnitId) ?? null;
  }

  async write(
    businessUnitId: string,
    credential: GatewayCredential,
  ): Promise<void> {
    this.credentials.set(businessUnitId, credential);
  }

  async erase(businessUnitId: string): Promise<void> {
    this.credentials.delete(businessUnitId);
  }
}

export class FakeCrmDirectory implements CrmDirectoryPort {
  constructor(
    private readonly contacts: Record<string, HolderContact> = {},
    private readonly companyByPerson: Record<string, string> = {},
  ) {}

  async findHolderContact(
    holder: ContractHolder,
  ): Promise<HolderContact | null> {
    return this.contacts[holder.recordId] ?? null;
  }

  async findCompanyIdForPerson(personId: string): Promise<string | null> {
    return this.companyByPerson[personId] ?? null;
  }
}

export class FakeEventDeduplication implements EventDeduplicationPort {
  readonly applied = new Set<string>();

  async hasBeenApplied(eventId: string): Promise<boolean> {
    return this.applied.has(eventId);
  }

  async markAsApplied(eventId: string): Promise<void> {
    this.applied.add(eventId);
  }
}

export class FakeGateway implements PaymentGatewayPort {
  readonly provider = 'ROUTERFY' as const;
  readonly removedWebhooks: string[] = [];
  readonly registeredUrls: string[] = [];
  findCalls = 0;

  constructor(
    private readonly options: {
      contract?: GatewayContract | null;
      credentialsAccepted?: boolean;
      webhookId?: string;
    } = {},
  ) {}

  async validateCredentials(): Promise<boolean> {
    return this.options.credentialsAccepted ?? true;
  }

  async findContractByIdentifier(): Promise<GatewayContract | null> {
    this.findCalls += 1;

    return this.options.contract ?? null;
  }

  async registerWebhook(webhookUrl: string): Promise<string> {
    this.registeredUrls.push(webhookUrl);

    return this.options.webhookId ?? 'gw-hook-new';
  }

  async removeWebhook(webhookRegistrationId: string): Promise<void> {
    this.removedWebhooks.push(webhookRegistrationId);
  }
}

export class FakeWebhookRegistry implements WebhookRegistryPort {
  readonly claims = new Map<string, WebhookClaim>();
  readonly released: string[] = [];

  async claim(registrationId: string, claim: WebhookClaim): Promise<void> {
    this.claims.set(registrationId, claim);
  }

  async resolve(registrationId: string): Promise<WebhookClaim | null> {
    return this.claims.get(registrationId) ?? null;
  }

  async release(registrationId: string): Promise<void> {
    this.released.push(registrationId);
    this.claims.delete(registrationId);
  }
}

export const fixedClock = (nowIso = '2026-09-18T12:00:00.000Z'): ClockPort => ({
  nowIso: () => nowIso,
});

export const fixedIdentifiers = (
  value = 'registration-fixed',
): IdentifierGeneratorPort => ({
  generate: () => value,
});
