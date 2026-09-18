import { type Money } from 'src/financeiro/core/domain/value-objects/money.value-object';

/**
 * Uma BU e um par de chaves de gateway — e, por consequencia, um bus.
 *
 * Cada BU tem o seu registro de webhook no gateway, entao evento de uma BU nunca
 * chega pelo caminho de outra. E o que permite clube e aluno compartilharem a
 * mesma chave (mesma BU) ou ficarem separados (BUs distintas) sem nada no codigo
 * decidir isso por eles.
 */
export type GatewayProvider = 'ROUTERFY';

export type BusinessUnitStatus = 'ACTIVE' | 'INVALID' | 'PENDING';

export type BusinessUnit = {
  id: string;
  name: string;
  gatewayProvider: GatewayProvider;
  apiKeyPreview: string;
  keyFingerprint: string;
  /** O UUID que vai na URL do resolver. E o que identifica o bus desta BU. */
  webhookRegistrationId: string | null;
  /** O id que o gateway deu ao registro do webhook. So serve para remove-lo. */
  gatewayWebhookId: string | null;
  connectionStatus: BusinessUnitStatus;
  lastValidatedAt: string | null;
  isDefault: boolean;
};

/** As chaves em si. Nunca moram no registro — so no cofre. */
export type GatewayCredential = {
  apiKey: string;
  secretKey: string;
};

const PREVIEW_LENGTH = 6;

/**
 * O pedaco da chave que a pessoa ve para reconhecer qual BU e qual.
 *
 * Suficiente para distinguir duas BUs numa lista, curto o bastante para nao
 * servir a quem so leu a tela.
 */
export const apiKeyPreviewFrom = (apiKey: string): string =>
  `${apiKey.slice(0, PREVIEW_LENGTH)}...`;

export type BusinessUnitTotals = {
  openAmount: Money;
  paidAmount: Money;
};
