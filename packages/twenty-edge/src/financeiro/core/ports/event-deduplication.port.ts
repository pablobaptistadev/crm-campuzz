/**
 * Memoria de quais eventos ja foram aplicados.
 *
 * O Campuzz grava `webhooks.event_id` e nunca consulta — sem unique, sem dedup —
 * entao reentrega do gateway duplica efeito. Aqui a checagem e obrigatoria antes
 * de aplicar qualquer evento.
 */
export type EventDeduplicationPort = {
  hasBeenApplied(eventId: string): Promise<boolean>;
  markAsApplied(eventId: string): Promise<void>;
};
