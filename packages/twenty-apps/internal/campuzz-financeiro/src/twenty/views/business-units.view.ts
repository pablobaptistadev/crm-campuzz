import { defineView, ViewSortDirection, ViewType } from 'twenty-sdk/define';

import { BUSINESS_UNIT, VIEWS } from 'src/twenty/constants/universal-identifiers';

export default defineView({
  universalIdentifier: VIEWS.businessUnits,
  name: 'BUs',
  objectUniversalIdentifier: BUSINESS_UNIT.object,
  type: ViewType.TABLE,
  icon: 'IconBuildingBank',
  position: 0,
  fields: [
    {
      universalIdentifier: '187dc915-211b-4ebb-958b-737137b3e3cf',
      fieldMetadataUniversalIdentifier: BUSINESS_UNIT.name,
      position: 0,
      isVisible: true,
      size: 200,
    },
    {
      universalIdentifier: '5ff0007f-c0d6-40e7-aa21-cd396da226d0',
      fieldMetadataUniversalIdentifier: BUSINESS_UNIT.connectionStatus,
      position: 1,
      isVisible: true,
      size: 150,
    },
    {
      universalIdentifier: '56fda16d-74bd-4b3f-8c4f-c94ed2e71fa3',
      fieldMetadataUniversalIdentifier: BUSINESS_UNIT.isDefault,
      position: 2,
      isVisible: true,
      size: 110,
    },
    {
      universalIdentifier: '01969d28-b00f-4806-9a0c-c4fef0cdc8f8',
      fieldMetadataUniversalIdentifier: BUSINESS_UNIT.apiKeyPreview,
      position: 3,
      isVisible: true,
      size: 150,
    },
    {
      universalIdentifier: 'e20cdea8-e74b-49b6-a3bf-0f4c5e61474e',
      fieldMetadataUniversalIdentifier: BUSINESS_UNIT.lastValidatedAt,
      position: 4,
      isVisible: true,
      size: 160,
    },
  ],
  sorts: [
    {
      universalIdentifier: 'fe7e9162-547c-4b41-a4fa-aae022136495',
      fieldMetadataUniversalIdentifier: BUSINESS_UNIT.name,
      direction: ViewSortDirection.ASC,
    },
  ],
});
