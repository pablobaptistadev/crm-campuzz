import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { z } from 'zod';

import { attachContract } from 'src/core/use-cases/attach-contract.use-case';
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
  businessUnitId: z.string().min(1),
  identifier: z.string().min(1),
});

export const attachContractHandler = async (payload: RoutePayload<unknown>) => {
  const parsed = INPUT_SCHEMA.safeParse(payload.body);

  if (!parsed.success) {
    return {
      success: false,
      code: 'INVALID_INPUT',
      error: 'Informe o numero do contrato e escolha a BU.',
    };
  }

  const container = buildContainer();

  try {
    const result = await attachContract(container, {
      holder: holderFrom(parsed.data.targetType, parsed.data.targetId),
      businessUnitId: parsed.data.businessUnitId,
      identifier: parsed.data.identifier,
    });

    return {
      success: true,
      contractId: result.contract.id,
      invoiceCount: result.invoiceCount,
    };
  } catch (error) {
    return serializeError(error);
  }
};

export default defineLogicFunction({
  universalIdentifier: LOGIC_FUNCTIONS.attachContract,
  name: 'campuzz-financeiro-vincular-contrato',
  description:
    'Vincula o contrato ao clube ou ao membro e traz as faturas dele para o CRM.',
  timeoutSeconds: 120,
  handler: attachContractHandler,
  httpRouteTriggerSettings: {
    path: ROUTES.attachContract,
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
