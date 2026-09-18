import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { z } from 'zod';

import { moneyToUnits } from 'src/core/domain/value-objects/money.value-object';
import { syncHolderContracts } from 'src/core/use-cases/sync-holder-contracts.use-case';
import { buildContainer } from 'src/infrastructure/container';
import {
  LOGIC_FUNCTIONS,
  ROUTES,
} from 'src/twenty/constants/universal-identifiers';
import { holderFrom } from 'src/twenty/logic-functions/utils/holder.util';
import { serializeError } from 'src/twenty/logic-functions/utils/serialize-error.util';

const INPUT_SCHEMA = z.object({
  targetType: z.enum(['COMPANY', 'PERSON']),
  targetId: z.string().min(1),
});

/**
 * Rele os contratos deste registro e devolve o resumo do financeiro.
 *
 * A aba chama isto ao abrir. O motivo de reler em vez de so mostrar o espelho: a
 * Routerfy nao assina nem garante a entrega dos webhooks, entao o espelho pode
 * estar velho — e uma tela de financeiro velha nao avisa que esta velha, so
 * mente. Reler no momento em que alguem olha e o que faz o numero valer.
 *
 * O resumo e calculado depois da releitura, sobre o que acabou de ser gravado.
 */
export const syncHolderContractsHandler = async (
  payload: RoutePayload<unknown>,
) => {
  const parsed = INPUT_SCHEMA.safeParse(payload.body);

  if (!parsed.success) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: 'Nao identificamos o registro desta aba.',
    };
  }

  const container = buildContainer();

  try {
    const holder = holderFrom(parsed.data.targetType, parsed.data.targetId);
    const result = await syncHolderContracts(container, holder);
    const summary = await container.invoices.summarizeForContracts(
      result.contracts.map((contract) => contract.id),
    );

    return {
      success: true,
      reconciled: result.reconciled,
      skipped: result.skipped,
      contractCount: result.contracts.length,
      openAmount: moneyToUnits(summary.openAmount),
      paidAmount: moneyToUnits(summary.paidAmount),
      openCount: summary.openCount,
      paidCount: summary.paidCount,
      nextDueAt: summary.nextDueAt,
      syncedAt: container.clock.nowIso(),
    };
  } catch (error) {
    return serializeError(error);
  }
};

export default defineLogicFunction({
  universalIdentifier: LOGIC_FUNCTIONS.syncHolderContracts,
  name: 'campuzz-financeiro-sincronizar-registro',
  description:
    'Rele no gateway os contratos de um clube ou membro e devolve o resumo das faturas.',
  timeoutSeconds: 120,
  handler: syncHolderContractsHandler,
  httpRouteTriggerSettings: {
    path: ROUTES.syncHolderContracts,
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
