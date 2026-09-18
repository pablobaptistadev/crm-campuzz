import { defineView, ViewSortDirection, ViewType } from 'twenty-sdk/define';

import {
  GATEWAY_CONTRACT,
  RELATIONS,
  VIEWS,
} from 'src/twenty/constants/universal-identifiers';

export default defineView({
  universalIdentifier: VIEWS.contratosAtivos,
  name: 'Contratos',
  objectUniversalIdentifier: GATEWAY_CONTRACT.object,
  type: ViewType.TABLE,
  icon: 'IconFileDollar',
  position: 0,
  fields: [
    {
      universalIdentifier: '36be1fb1-3565-4615-8b8d-49ed4d857ff3',
      fieldMetadataUniversalIdentifier: GATEWAY_CONTRACT.name,
      position: 0,
      isVisible: true,
      size: 180,
    },
    {
      universalIdentifier: '9d431c82-aeb1-481d-8198-c47ad666f781',
      fieldMetadataUniversalIdentifier: GATEWAY_CONTRACT.contractStatus,
      position: 1,
      isVisible: true,
      size: 140,
    },
    {
      universalIdentifier: '79fca79e-59cb-40b1-a7f4-428038eb6445',
      fieldMetadataUniversalIdentifier: GATEWAY_CONTRACT.totalValue,
      position: 2,
      isVisible: true,
      size: 150,
    },
    {
      universalIdentifier: '97189faf-b72e-4d01-8ddb-dda900ddcb89',
      fieldMetadataUniversalIdentifier: GATEWAY_CONTRACT.nextChargeAt,
      position: 3,
      isVisible: true,
      size: 160,
    },
    {
      universalIdentifier: '96fd2198-273c-4b3f-a4d5-f0301609bcea',
      fieldMetadataUniversalIdentifier: RELATIONS.companyOnContract,
      position: 4,
      isVisible: true,
      size: 180,
    },
    {
      universalIdentifier: '69702172-96c4-49c1-a2ab-174e2cb43a48',
      fieldMetadataUniversalIdentifier: RELATIONS.personOnContract,
      position: 5,
      isVisible: true,
      size: 180,
    },
    {
      universalIdentifier: 'ea9f611f-6d58-4c21-9d80-90e3aa2c7cd4',
      fieldMetadataUniversalIdentifier: RELATIONS.businessUnitOnContract,
      position: 6,
      isVisible: true,
      size: 160,
    },
  ],
  sorts: [
    {
      universalIdentifier: '3f7a5961-5be9-447f-8589-673ec440cdc0',
      fieldMetadataUniversalIdentifier: GATEWAY_CONTRACT.nextChargeAt,
      direction: ViewSortDirection.ASC,
    },
  ],
});
