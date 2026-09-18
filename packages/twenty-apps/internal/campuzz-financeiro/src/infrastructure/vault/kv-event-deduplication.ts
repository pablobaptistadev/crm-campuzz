import { kv } from 'twenty-sdk/logic-function';

import { type EventDeduplicationPort } from 'src/core/ports/event-deduplication.port';
import { appliedEventKey } from 'src/infrastructure/vault/kv-keys';

/**
 * Quais eventos ja foram aplicados.
 *
 * Existe porque a Routerfy reentrega e nao assina: sem esta marca, um retry
 * duplica fatura na aba do financeiro. O Campuzz grava o `event_id` numa coluna
 * que nenhuma query le — a marca sem a consulta nao protege de nada.
 */
export class KvEventDeduplication implements EventDeduplicationPort {
  async hasBeenApplied(eventId: string): Promise<boolean> {
    return (await kv.get<boolean>(appliedEventKey(eventId))) === true;
  }

  async markAsApplied(eventId: string): Promise<void> {
    await kv.set(appliedEventKey(eventId), true);
  }
}
