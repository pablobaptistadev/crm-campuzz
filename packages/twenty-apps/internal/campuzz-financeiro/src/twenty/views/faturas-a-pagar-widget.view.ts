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

/**
 * As faturas em aberto, para o widget da aba Financeiro.
 *
 * Nao filtra por registro: o recorte vem do widget, que chega ate aqui em dois
 * saltos (clube ou membro -> contratos -> faturas). Aqui so decidimos o que
 * conta como "a pagar".
 */
export default defineView({
  universalIdentifier: WIDGET_VIEWS.faturasAPagarWidget,
  name: 'Faturas a pagar (widget)',
  objectUniversalIdentifier: GATEWAY_INVOICE.object,
  type: ViewType.TABLE_WIDGET,
  icon: 'IconClockDollar',
  fields: [
    {
      universalIdentifier: '97270053-e155-4e7f-9c01-985037b796af',
      fieldMetadataUniversalIdentifier: GATEWAY_INVOICE.name,
      position: 0,
      isVisible: true,
      size: 160,
    },
    {
      universalIdentifier: '935dd608-7ee2-4bd2-9767-2e45cda096fe',
      fieldMetadataUniversalIdentifier: GATEWAY_INVOICE.dueAt,
      position: 1,
      isVisible: true,
      size: 140,
    },
    {
      universalIdentifier: '379e015e-5443-4064-8ad1-13f71a9f237e',
      fieldMetadataUniversalIdentifier: GATEWAY_INVOICE.amount,
      position: 2,
      isVisible: true,
      size: 140,
    },
    {
      universalIdentifier: '744af135-5f66-4587-a2dc-4b19f8596d49',
      fieldMetadataUniversalIdentifier: GATEWAY_INVOICE.invoiceStatus,
      position: 3,
      isVisible: true,
      size: 170,
    },
  ],
  filters: [
    {
      universalIdentifier: '9056a47b-9489-496c-a400-0e822276e685',
      fieldMetadataUniversalIdentifier: GATEWAY_INVOICE.invoiceStatus,
      operand: ViewFilterOperand.IS,
      value: ['PENDING', 'WAITING_PAYMENT', 'OVERDUE'],
    },
  ],
  sorts: [
    {
      universalIdentifier: '9cbd3fad-99a2-4ff0-96f7-32af835675cf',
      fieldMetadataUniversalIdentifier: GATEWAY_INVOICE.dueAt,
      direction: ViewSortDirection.ASC,
    },
  ],
});
