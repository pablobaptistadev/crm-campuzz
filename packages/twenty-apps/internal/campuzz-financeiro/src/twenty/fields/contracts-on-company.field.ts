import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  GATEWAY_CONTRACT,
  RELATIONS,
} from 'src/twenty/constants/universal-identifiers';

export default defineField({
  universalIdentifier: RELATIONS.contractsOnCompany,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  type: FieldType.RELATION,
  name: 'gatewayContracts',
  label: 'Contratos',
  icon: 'IconFileDollar',
  relationTargetObjectMetadataUniversalIdentifier:
    GATEWAY_CONTRACT.object,
  relationTargetFieldMetadataUniversalIdentifier:
    RELATIONS.companyOnContract,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
