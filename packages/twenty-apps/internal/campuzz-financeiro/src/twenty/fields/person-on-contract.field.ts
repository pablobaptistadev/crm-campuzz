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
  universalIdentifier: RELATIONS.personOnContract,
  objectUniversalIdentifier:
    GATEWAY_CONTRACT.object,
  type: FieldType.RELATION,
  name: 'person',
  label: 'Membro',
  description:
    'Preenchido quando o contrato e do membro.',
  icon: 'IconUser',
  relationTargetObjectMetadataUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
  relationTargetFieldMetadataUniversalIdentifier:
    RELATIONS.contractsOnPerson,
  universalSettings: {
    relationType: RelationType.MANY_TO_ONE,
    onDelete: OnDeleteAction.SET_NULL,
    joinColumnName: 'personId',
  },
});
