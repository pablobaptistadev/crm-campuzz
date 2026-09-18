import { defineIndex } from 'twenty-sdk/define';

import {
  GATEWAY_CONTRACT,
  INDEX_FIELDS,
  INDEXES,
} from 'src/twenty/constants/universal-identifiers';

export default defineIndex({
  universalIdentifier: INDEXES.contractTransaction,
  objectUniversalIdentifier: GATEWAY_CONTRACT.object,
  isUnique: true,
  fields: [
    {
      universalIdentifier: INDEX_FIELDS.contractTransaction,
      fieldUniversalIdentifier: GATEWAY_CONTRACT.externalTransactionId,
    },
  ],
});
