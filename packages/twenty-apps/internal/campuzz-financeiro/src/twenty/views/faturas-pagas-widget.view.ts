import {
  defineView,
  ViewFilterOperand,
  ViewSortDirection,
  ViewType,
} from 'twenty-sdk/define';

import {
  GATEWAY_INVOICE,
  WIDGET_VIEWS,
} from 'src/twenty/constants/universal-identifiers';

export default defineView({
  universalIdentifier: WIDGET_VIEWS.faturasPagasWidget,
  name: 'Faturas pagas (widget)',
  objectUniversalIdentifier: GATEWAY_INVOICE.object,
  type: ViewType.TABLE_WIDGET,
  icon: 'IconCircleCheck',
  fields: [
    {
      universalIdentifier: '373ca931-6e6a-4c0e-9b40-aeb915d9af5b',
      fieldMetadataUniversalIdentifier: GATEWAY_INVOICE.name,
      position: 0,
      isVisible: true,
      size: 160,
    },
    {
      universalIdentifier: 'b332ca7d-f562-45df-98b5-50a7b215f977',
      fieldMetadataUniversalIdentifier: GATEWAY_INVOICE.paidAt,
      position: 1,
      isVisible: true,
      size: 140,
    },
    {
      universalIdentifier: 'e238b930-526d-4445-837d-f9f1a935b636',
      fieldMetadataUniversalIdentifier: GATEWAY_INVOICE.amount,
      position: 2,
      isVisible: true,
      size: 140,
    },
  ],
  filters: [
    {
      universalIdentifier: 'ee8925c2-26d2-433c-a2cf-0b92a691af05',
      fieldMetadataUniversalIdentifier: GATEWAY_INVOICE.invoiceStatus,
      operand: ViewFilterOperand.IS,
      value: ['PAID'],
    },
  ],
  sorts: [
    {
      universalIdentifier: '2359756a-f3f6-4daf-8cf7-dcaafc10df7f',
      fieldMetadataUniversalIdentifier: GATEWAY_INVOICE.paidAt,
      direction: ViewSortDirection.DESC,
    },
  ],
});
