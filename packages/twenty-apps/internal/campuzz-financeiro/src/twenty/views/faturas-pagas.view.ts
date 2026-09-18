import {
  defineView,
  ViewFilterOperand,
  ViewSortDirection,
  ViewType,
} from 'twenty-sdk/define';

import {
  GATEWAY_INVOICE,
  RELATIONS,
  VIEWS,
} from 'src/twenty/constants/universal-identifiers';

export default defineView({
  universalIdentifier: VIEWS.faturasPagas,
  name: 'Faturas pagas',
  objectUniversalIdentifier: GATEWAY_INVOICE.object,
  type: ViewType.TABLE,
  icon: 'IconCircleCheck',
  position: 1,
  fields: [
    {
      universalIdentifier: 'ea13a425-b311-4cca-aa8b-d0fd3d9f5ce2',
      fieldMetadataUniversalIdentifier: GATEWAY_INVOICE.name,
      position: 0,
      isVisible: true,
      size: 180,
    },
    {
      universalIdentifier: 'd46b77c0-2374-42d4-a40c-c4bb5c14381a',
      fieldMetadataUniversalIdentifier: GATEWAY_INVOICE.paidAt,
      position: 1,
      isVisible: true,
      size: 150,
    },
    {
      universalIdentifier: 'f39ae626-b0fd-4c2f-a890-6c5bf022d56f',
      fieldMetadataUniversalIdentifier: GATEWAY_INVOICE.amount,
      position: 2,
      isVisible: true,
      size: 150,
    },
    {
      universalIdentifier: '84c7eaf1-b604-4e68-865f-ec0bd634de5d',
      fieldMetadataUniversalIdentifier: RELATIONS.contractOnInvoice,
      position: 3,
      isVisible: true,
      size: 200,
    },
  ],
  filters: [
    {
      universalIdentifier: 'be1ef783-30fc-4e42-817a-274e73b1c219',
      fieldMetadataUniversalIdentifier: GATEWAY_INVOICE.invoiceStatus,
      operand: ViewFilterOperand.IS,
      value: ['PAID'],
    },
  ],
  sorts: [
    {
      universalIdentifier: '1dcd8601-f8c2-439d-ae20-43ba48dc3fc1',
      fieldMetadataUniversalIdentifier: GATEWAY_INVOICE.paidAt,
      direction: ViewSortDirection.DESC,
    },
  ],
});
