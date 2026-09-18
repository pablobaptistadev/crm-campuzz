import {
  defineField,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  BUSINESS_UNIT,
  RELATIONS,
} from 'src/twenty/constants/universal-identifiers';

/**
 * A BU do Clube.
 *
 * Apagar a BU nao pode apagar o clube: `SET_NULL` deixa o clube cair na BU
 * padrao em vez de sumir junto com a credencial.
 */
export default defineField({
  universalIdentifier: RELATIONS.businessUnitOnCompany,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  type: FieldType.RELATION,
  name: 'businessUnit',
  label: 'BU',
  description:
    'A BU deste clube. Os membros dele herdam esta BU quando nao tem uma propria.',
  icon: 'IconBuildingBank',
  relationTargetObjectMetadataUniversalIdentifier: BUSINESS_UNIT.object,
  relationTargetFieldMetadataUniversalIdentifier:
    RELATIONS.companiesOnBusinessUnit,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'businessUnitId',
  },
});
