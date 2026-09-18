import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
} from 'twenty-sdk/define';

import {
  BUSINESS_UNIT,
  GATEWAY_CONTRACT,
  RELATIONS,
} from 'src/twenty/constants/universal-identifiers';

export default defineField({
  universalIdentifier: RELATIONS.businessUnitOnContract,
  objectUniversalIdentifier:
    GATEWAY_CONTRACT.object,
  type: FieldType.RELATION,
  name: 'businessUnit',
  label: 'BU',
  description:
    'Por qual BU este contrato foi lido. E por ela que ele e relido depois.',
  icon: 'IconBuildingBank',
  relationTargetObjectMetadataUniversalIdentifier:
    BUSINESS_UNIT.object,
  relationTargetFieldMetadataUniversalIdentifier:
    RELATIONS.contractsOnBusinessUnit,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'businessUnitId',
  },
});
