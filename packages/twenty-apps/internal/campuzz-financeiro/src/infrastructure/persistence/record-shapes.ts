import { type CoreApiClient } from 'twenty-client-sdk/core';

/**
 * O client do workspace e gerado por instalacao, entao `query` e `mutation`
 * chegam sem tipo. Declaramos aqui o formato do que pedimos, uma vez, em vez de
 * espalhar anotacao solta por cada chamada.
 */
export type ReadWriteClient = Pick<CoreApiClient, 'query' | 'mutation'>;

export type BusinessUnitRecord = {
  id: string;
  name: string | null;
  gatewayProvider: string | null;
  apiKeyPreview: string | null;
  keyFingerprint: string | null;
  webhookRegistrationId: string | null;
  gatewayWebhookId: string | null;
  connectionStatus: string | null;
  lastValidatedAt: string | null;
  isDefault: boolean | null;
};

export type GatewayContractRecord = {
  id: string;
  externalSubscriptionId: string | null;
  externalTransactionId: string | null;
  businessUnitId: string | null;
  companyId: string | null;
  personId: string | null;
};

export type Connection<TNode> = {
  edges?: { node: TNode }[];
};

export const firstNode = <TNode>(
  connection: Connection<TNode> | undefined,
): TNode | null => connection?.edges?.[0]?.node ?? null;

export const allNodes = <TNode>(
  connection: Connection<TNode> | undefined,
): TNode[] => connection?.edges?.map((edge) => edge.node) ?? [];

export const BUSINESS_UNIT_SELECTION = {
  id: true,
  name: true,
  gatewayProvider: true,
  apiKeyPreview: true,
  keyFingerprint: true,
  webhookRegistrationId: true,
  gatewayWebhookId: true,
  connectionStatus: true,
  lastValidatedAt: true,
  isDefault: true,
} as const;

export const CONTRACT_SELECTION = {
  id: true,
  externalSubscriptionId: true,
  externalTransactionId: true,
  businessUnitId: true,
  companyId: true,
  personId: true,
} as const;
