import {
  type BusinessUnit,
  type BusinessUnitStatus,
} from 'src/core/domain/entities/business-unit.entity';

export type BusinessUnitDraft = {
  id?: string;
  name: string;
  gatewayProvider: BusinessUnit['gatewayProvider'];
  apiKeyPreview: string;
  keyFingerprint: string;
  webhookRegistrationId: string | null;
  gatewayWebhookId: string | null;
  connectionStatus: BusinessUnitStatus;
  lastValidatedAt: string | null;
  isDefault: boolean;
};

export type BusinessUnitRepositoryPort = {
  findById(businessUnitId: string): Promise<BusinessUnit | null>;
  findDefault(): Promise<BusinessUnit | null>;
  findByCompanyId(companyId: string): Promise<BusinessUnit | null>;
  findByPersonId(personId: string): Promise<BusinessUnit | null>;
  listAll(): Promise<readonly BusinessUnit[]>;
  save(draft: BusinessUnitDraft): Promise<BusinessUnit>;

  /**
   * Tira a marca de padrao de todas as outras.
   *
   * Duas BUs padrao fariam a resolucao depender da ordem que o banco devolve —
   * exatamente o problema que o Campuzz tem ao escolher a integracao ativa com
   * um `find` sem `orderBy` (enrollment.service.ts:65).
   */
  clearDefaultExcept(businessUnitId: string): Promise<void>;
};
