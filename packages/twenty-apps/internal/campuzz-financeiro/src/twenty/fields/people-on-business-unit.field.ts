import {
  defineField,
  FieldType,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  BUSINESS_UNIT,
  RELATIONS,
} from 'src/twenty/constants/universal-identifiers';

export default defineField({
  universalIdentifier: RELATIONS.peopleOnBusinessUnit,
  objectUniversalIdentifier: BUSINESS_UNIT.object,
  type: FieldType.RELATION,
  name: 'people',
  label: 'Membros',
  icon: 'IconUsers',
  relationTargetObjectMetadataUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier: RELATIONS.businessUnitOnPerson,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
