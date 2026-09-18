import { defineLogicFunction, type RoutePayload } from 'twenty-sdk/define';
import { z } from 'zod';

import { moneyToUnits } from 'src/core/domain/value-objects/money.value-object';
import { previewContract } from 'src/core/use-cases/preview-contract.use-case';
import { buildContainer } from 'src/infrastructure/container';
import { totalValueOf } from 'src/infrastructure/gateways/routerfy/routerfy-contract.mapper';
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

/**
 * O passo 2 do popup: o que encontramos antes de gravar.
 *
 * Devolve valores ja em reais porque quem le e uma tela, nao o dominio. Micros
 * sao a moeda interna; convertemos na fronteira, que e aqui.
 */
export const previewContractHandler = async (payload: RoutePayload<unknown>) => {
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
    const result = await previewContract(container, {
      holder: holderFrom(parsed.data.targetType, parsed.data.targetId),
      businessUnitId: parsed.data.businessUnitId,
      identifier: parsed.data.identifier,
    });

    const { contract } = result;

    return {
      success: true,
      alreadyLinkedContractId: result.alreadyLinkedContractId,
      businessUnitName: result.businessUnit.name,
      customer: contract.customer,
      contract: {
        kind: contract.kind,
        code: contract.code,
        status: contract.status,
        amount: moneyToUnits(contract.amount),
        totalValue: moneyToUnits(totalValueOf(contract)),
        frequency: contract.frequency,
        frequencyInterval: contract.frequencyInterval,
        startsAt: contract.startsAt,
        endsAt: contract.endsAt,
        nextChargeAt: contract.nextChargeAt,
        paymentMethod: contract.paymentMethod,
        invoiceCount: contract.invoices.length,
        paidInvoiceCount: contract.invoices.filter(
          (invoice) => invoice.status.trim().toLowerCase() === 'paid',
        ).length,
      },
    };
  } catch (error) {
    return serializeError(error);
  }
};

export default defineLogicFunction({
  universalIdentifier: LOGIC_FUNCTIONS.previewContract,
  name: 'campuzz-financeiro-validar-contrato',
  description:
    'Valida um contrato no gateway, confere o titular e avisa se ele ja esta vinculado.',
  timeoutSeconds: 90,
  handler: previewContractHandler,
  httpRouteTriggerSettings: {
    path: ROUTES.previewContract,
    httpMethod: 'POST',
    isAuthRequired: true,
  },
});
