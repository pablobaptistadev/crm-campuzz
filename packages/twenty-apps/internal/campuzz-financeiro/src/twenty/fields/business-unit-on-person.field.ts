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
 * A BU do Membro.
 *
 * So precisa ser preenchida quando o membro destoa do clube dele. Vazia, a
 * resolucao cai no clube e depois na BU padrao.
 */
export default defineField({
  universalIdentifier: RELATIONS.businessUnitOnPerson,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  type: FieldType.RELATION,
  name: 'businessUnit',
  label: 'BU',
  description:
    'A BU deste membro. Vazia, usamos a do clube dele e, na falta dela, a BU padrao.',
  icon: 'IconBuildingBank',
  relationTargetObjectMetadataUniversalIdentifier: BUSINESS_UNIT.object,
  relationTargetFieldMetadataUniversalIdentifier: RELATIONS.peopleOnBusinessUnit,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'businessUnitId',
  },
});
