import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  GATEWAY_CONTRACT,
  RELATIONS,
} from 'src/twenty/constants/universal-identifiers';

export default defineField({
  universalIdentifier: RELATIONS.companyOnContract,
  objectUniversalIdentifier:
    GATEWAY_CONTRACT.object,
  type: FieldType.RELATION,
  name: 'company',
  label: 'Clube',
  description:
    'Preenchido quando o contrato e do clube. Um contrato tem clube ou membro, nunca os dois.',
  icon: 'IconBuildingSkyscraper',
  relationTargetObjectMetadataUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier:
    RELATIONS.contractsOnCompany,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'companyId',
  },
});
