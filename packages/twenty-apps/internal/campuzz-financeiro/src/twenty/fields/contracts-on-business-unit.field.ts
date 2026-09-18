import {
  defineField,
  FieldType,
  RelationType,
} from 'twenty-sdk/define';

import {
  BUSINESS_UNIT,
  GATEWAY_CONTRACT,
  RELATIONS,
} from 'src/twenty/constants/universal-identifiers';

export default defineField({
  universalIdentifier: RELATIONS.contractsOnBusinessUnit,
  objectUniversalIdentifier:
    BUSINESS_UNIT.object,
  type: FieldType.RELATION,
  name: 'gatewayContracts',
  label: 'Contratos',
  icon: 'IconFileDollar',
  relationTargetObjectMetadataUniversalIdentifier:
    GATEWAY_CONTRACT.object,
  relationTargetFieldMetadataUniversalIdentifier:
    RELATIONS.businessUnitOnContract,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
