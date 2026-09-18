/**
 * A reivindicacao que o resolver de webhook le antes de ter contexto de workspace.
 *
 * O resolver so recebe o `registrationId` da URL. E por este mapa que ele
 * descobre para qual workspace e para qual BU despachar — e e o que faz um
 * `registrationId` desconhecido morrer com 404 em vez de entrar.
 */
export type WebhookClaim = {
  workspaceId: string;
  businessUnitId: string;
};

export type WebhookRegistryPort = {
  claim(registrationId: string, claim: WebhookClaim): Promise<void>;
  resolve(registrationId: string): Promise<WebhookClaim | null>;
  release(registrationId: string): Promise<void>;
};
