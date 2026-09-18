import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { z } from 'zod';

import { saveBusinessUnit } from 'src/core/use-cases/save-business-unit.use-case';
import { buildContainer } from 'src/infrastructure/container';
import {
  LOGIC_FUNCTIONS,
  ROUTES,
} from 'src/twenty/constants/universal-identifiers';
import { serializeError } from 'src/twenty/logic-functions/utils/serialize-error.util';
import { buildWebhookUrl } from 'src/twenty/logic-functions/utils/webhook-url.util';

const INPUT_SCHEMA = z.object({
  businessUnitId: z.string().min(1).optional(),
  name: z.string().min(1),
  apiKey: z.string().min(1),
  secretKey: z.string().min(1),
  isDefault: z.boolean().default(false),
  workspaceId: z.string().min(1),
});

/**
 * Cadastra ou reconfigura uma BU a partir do popup.
 *
 * A funcao e casca: valida a forma da entrada, monta o container e chama o caso
 * de uso. Toda a ordem que importa — validar antes de gravar, trocar o webhook
 * antes de guardar a chave nova — mora no core, onde da para testar sem subir
 * nada.
 */
export const saveBusinessUnitHandler = async (
  payload: RoutePayload<unknown>,
) => {
  const parsed = INPUT_SCHEMA.safeParse(payload.body);

  if (!parsed.success) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: 'Informe o nome da BU, a api key e a secret key.',
    };
  }

  const container = buildContainer();

  try {
    const businessUnit = await saveBusinessUnit(
      {
        ...container,
        buildWebhookUrl,
        workspaceId: parsed.data.workspaceId,
      },
      {
        businessUnitId: parsed.data.businessUnitId,
        name: parsed.data.name,
        credential: {
          apiKey: parsed.data.apiKey,
          secretKey: parsed.data.secretKey,
        },
        isDefault: parsed.data.isDefault,
      },
    );

    return {
      success: true,
      businessUnit: {
        id: businessUnit.id,
        name: businessUnit.name,
        apiKeyPreview: businessUnit.apiKeyPreview,
        connectionStatus: businessUnit.connectionStatus,
        isDefault: businessUnit.isDefault,
      },
    };
  } catch (error) {
    return serializeError(error);
  }
};

export default defineLogicFunction({
  universalIdentifier: LOGIC_FUNCTIONS.saveBusinessUnit,
  name: 'campuzz-financeiro-salvar-bu',
  description:
    'Valida as chaves de uma BU no gateway, guarda no cofre e registra o webhook dela.',
  timeoutSeconds: 60,
  handler: saveBusinessUnitHandler,
  httpRouteTriggerSettings: {
    path: ROUTES.saveBusinessUnit,
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
