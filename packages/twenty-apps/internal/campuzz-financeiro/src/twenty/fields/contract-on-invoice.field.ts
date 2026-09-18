import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import {
  GATEWAY_CONTRACT,
  GATEWAY_INVOICE,
  RELATIONS,
} from 'src/twenty/constants/universal-identifiers';

export default defineField({
  universalIdentifier: RELATIONS.contractOnInvoice,
  objectUniversalIdentifier:
    GATEWAY_INVOICE.object,
  type: FieldType.RELATION,
  name: 'gatewayContract',
  label: 'Contrato',
  icon: 'IconFileDollar',
  relationTargetObjectMetadataUniversalIdentifier:
    GATEWAY_CONTRACT.object,
  relationTargetFieldMetadataUniversalIdentifier:
    RELATIONS.invoicesOnContract,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'gatewayContractId',
  },
});
