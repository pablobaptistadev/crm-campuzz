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

/**
 * As faturas que ainda vao ser cobradas, mais proximas primeiro.
 *
 * E a view que justifica ter espelhado as faturas em vez de busca-las sob
 * demanda: ordenar por vencimento e somar valores nao da para fazer com uma
 * chamada ao gateway por tela.
 */
export default defineView({
  universalIdentifier: VIEWS.faturasAPagar,
  name: 'Faturas a pagar',
  objectUniversalIdentifier: GATEWAY_INVOICE.object,
  type: ViewType.TABLE,
  icon: 'IconClockDollar',
  position: 0,
  fields: [
    {
      universalIdentifier: '75e2bd8c-de63-4d73-81c8-3a3b1cb0de00',
      fieldMetadataUniversalIdentifier: GATEWAY_INVOICE.name,
      position: 0,
      isVisible: true,
      size: 180,
    },
    {
      universalIdentifier: '2a8ad5a3-5b71-4fd8-bb27-95de9c6ee76d',
      fieldMetadataUniversalIdentifier: GATEWAY_INVOICE.dueAt,
      position: 1,
      isVisible: true,
      size: 150,
    },
    {
      universalIdentifier: '9a57b621-b786-469a-abe7-a9e716da5427',
      fieldMetadataUniversalIdentifier: GATEWAY_INVOICE.amount,
      position: 2,
      isVisible: true,
      size: 150,
    },
    {
      universalIdentifier: 'c00f0cf0-c643-4b15-9ea9-b73f56b65853',
      fieldMetadataUniversalIdentifier: GATEWAY_INVOICE.invoiceStatus,
      position: 3,
      isVisible: true,
      size: 170,
    },
    {
      universalIdentifier: '35839719-3f75-4775-b44d-17a129cab248',
      fieldMetadataUniversalIdentifier: RELATIONS.contractOnInvoice,
      position: 4,
      isVisible: true,
      size: 200,
    },
  ],
  filters: [
    {
      universalIdentifier: 'd65f7291-c9a4-4cdb-935b-3b330dd434f9',
      fieldMetadataUniversalIdentifier: GATEWAY_INVOICE.invoiceStatus,
      operand: ViewFilterOperand.IS,
      value: ['PENDING', 'WAITING_PAYMENT', 'OVERDUE'],
    },
  ],
  sorts: [
    {
      universalIdentifier: 'f506f71a-7d09-4715-9603-51b3016801eb',
      fieldMetadataUniversalIdentifier: GATEWAY_INVOICE.dueAt,
      direction: ViewSortDirection.ASC,
    },
  ],
});
