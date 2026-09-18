import { defineView, ViewFilterOperand, ViewType } from 'twenty-sdk/define';

import {
  GATEWAY_CONTRACT,
  RELATIONS,
  WIDGET_VIEWS,
} from 'src/twenty/constants/universal-identifiers';

/**
 * Os contratos do membro aberto.
 *
 * `TABLE_WIDGET` em vez de `TABLE` para esta view nao aparecer no seletor de
 * views do indice — ela so faz sentido dentro do widget. O filtro
 * `isCurrentRecordSelected` e o que a prende ao registro aberto; sem ele o
 * widget listaria os contratos do workspace inteiro.
 */
export default defineView({
  universalIdentifier: WIDGET_VIEWS.contratosDoMembro,
  name: 'Contratos do membro',
  objectUniversalIdentifier: GATEWAY_CONTRACT.object,
  type: ViewType.TABLE_WIDGET,
  icon: 'IconFileDollar',
  fields: [
    {
      universalIdentifier: '16d97d1a-b467-421d-b0cb-c2a02c1f5160',
      fieldMetadataUniversalIdentifier: GATEWAY_CONTRACT.name,
      position: 0,
      isVisible: true,
      size: 180,
    },
    {
      universalIdentifier: 'b7bcb56f-29f2-4a4e-8401-9920f940eb05',
      fieldMetadataUniversalIdentifier: GATEWAY_CONTRACT.contractStatus,
      position: 1,
      isVisible: true,
      size: 130,
    },
    {
      universalIdentifier: '5ede82f1-9880-4823-aabf-ded27828e8d5',
      fieldMetadataUniversalIdentifier: GATEWAY_CONTRACT.totalValue,
      position: 2,
      isVisible: true,
      size: 140,
    },
    {
      universalIdentifier: '76a46ccb-dd49-4292-a2f5-6fc97a4bbca2',
      fieldMetadataUniversalIdentifier: GATEWAY_CONTRACT.nextChargeAt,
      position: 3,
      isVisible: true,
      size: 160,
    },
  ],
  filters: [
    {
      universalIdentifier: '5694c41b-43cc-44e3-a673-bd99849fd0f2',
      fieldMetadataUniversalIdentifier: RELATIONS.personOnContract,
      operand: ViewFilterOperand.IS,
      value: { selectedRecordIds: [], isCurrentRecordSelected: true },
    },
  ],
});
