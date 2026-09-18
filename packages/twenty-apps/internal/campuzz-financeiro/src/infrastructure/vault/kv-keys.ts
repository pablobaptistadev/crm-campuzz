/**
 * Chaves do kv, num lugar so.
 *
 * O escopo importa: credencial e dedup sao do workspace, mas a reivindicacao do
 * webhook e do SERVIDOR — o resolver precisa descobrir o workspace ANTES de ter
 * contexto de workspace, olhando so o registrationId que veio na URL.
 */
export const credentialKey = (businessUnitId: string): string =>
  `gateway-credential:${businessUnitId}`;

export const registrationClaimKey = (registrationId: string): string =>
  `gateway-registration:${registrationId}`;

export const appliedEventKey = (eventId: string): string =>
  `gateway-event-applied:${eventId}`;
