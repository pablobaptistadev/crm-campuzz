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
  universalIdentifier: RELATIONS.companiesOnBusinessUnit,
  objectUniversalIdentifier: BUSINESS_UNIT.object,
  type: FieldType.RELATION,
  name: 'companies',
  label: 'Clubes',
  icon: 'IconBuildingSkyscraper',
  relationTargetObjectMetadataUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier:
    RELATIONS.businessUnitOnCompany,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
});
