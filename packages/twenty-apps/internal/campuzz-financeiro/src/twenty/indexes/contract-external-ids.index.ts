import { defineIndex } from 'twenty-sdk/define';

import {
  GATEWAY_CONTRACT,
  INDEX_FIELDS,
  INDEXES,
} from 'src/twenty/constants/universal-identifiers';

/**
 * Um contrato do gateway so pode estar vinculado uma vez.
 *
 * `previewContract` consulta antes de gravar, mas consulta e gravacao nao sao
 * atomicas: duas pessoas vinculando o mesmo numero ao mesmo tempo passam as duas
 * pela consulta e criam dois registros — e o financeiro passa a contar a mesma
 * divida em dobro. O unico no banco e o que fecha essa janela.
 */
export default defineIndex({
  universalIdentifier: INDEXES.contractSubscription,
  objectUniversalIdentifier: GATEWAY_CONTRACT.object,
  isUnique: true,
  fields: [
    {
      universalIdentifier: INDEX_FIELDS.contractSubscription,
      fieldUniversalIdentifier: GATEWAY_CONTRACT.externalSubscriptionId,
    },
  ],
});
