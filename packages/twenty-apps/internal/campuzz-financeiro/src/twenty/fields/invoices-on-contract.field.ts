import {
  defineField,
  FieldType,
  RelationType,
} from 'twenty-sdk/define';

import {
  GATEWAY_CONTRACT,
  GATEWAY_INVOICE,
  RELATIONS,
} from 'src/twenty/constants/universal-identifiers';

export default defineField({
  universalIdentifier: RELATIONS.invoicesOnContract,
  objectUniversalIdentifier:
    GATEWAY_CONTRACT.object,
  type: FieldType.RELATION,
  name: 'gatewayInvoices',
  label: 'Faturas',
  icon: 'IconFileInvoice',
  relationTargetObjectMetadataUniversalIdentifier:
    GATEWAY_INVOICE.object,
  relationTargetFieldMetadataUniversalIdentifier:
    RELATIONS.contractOnInvoice,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
