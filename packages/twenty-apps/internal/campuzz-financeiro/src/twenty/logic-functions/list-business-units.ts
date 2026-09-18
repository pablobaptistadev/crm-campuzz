import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { z } from 'zod';

import { resolveBusinessUnit } from 'src/core/use-cases/resolve-business-unit.use-case';
import { FinanceiroError } from 'src/core/domain/errors/financeiro.error';
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
 * O que o popup precisa para montar o seletor de BU.
 *
 * Devolve todas as BUs cadastradas e qual delas a cascata escolheu para este
 * registro. Nao ter BU nenhuma nao e erro aqui: e o estado em que o popup abre
 * ja no formulario de cadastro, entao devolvemos a lista vazia e seguimos.
 */
export const listBusinessUnitsHandler = async (
  payload: RoutePayload<unknown>,
) => {
  const parsed = INPUT_SCHEMA.safeParse(payload.body);

  if (!parsed.success) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: 'Nao identificamos o registro que abriu esta janela.',
    };
  }

  const container = buildContainer();

  try {
    const holder = holderFrom(parsed.data.targetType, parsed.data.targetId);
    const businessUnits = await container.businessUnits.listAll();

    const resolved = await resolveBusinessUnit(container, holder).catch(
      (error: unknown) => {
        if (
          error instanceof FinanceiroError &&
          error.code === 'BUSINESS_UNIT_NOT_FOUND'
        ) {
          return null;
        }

        throw error;
      },
    );

    return {
      success: true,
      resolvedBusinessUnitId: resolved?.id ?? null,
      businessUnits: businessUnits.map((unit) => ({
        id: unit.id,
        name: unit.name,
        apiKeyPreview: unit.apiKeyPreview,
        connectionStatus: unit.connectionStatus,
        isDefault: unit.isDefault,
      })),
    };
  } catch (error) {
    return serializeError(error);
  }
};

export default defineLogicFunction({
  universalIdentifier: LOGIC_FUNCTIONS.listBusinessUnits,
  name: 'campuzz-financeiro-listar-bus',
  description:
    'Lista as BUs cadastradas e diz qual delas vale para o registro aberto.',
  timeoutSeconds: 30,
  handler: listBusinessUnitsHandler,
  httpRouteTriggerSettings: {
    path: ROUTES.listBusinessUnits,
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
