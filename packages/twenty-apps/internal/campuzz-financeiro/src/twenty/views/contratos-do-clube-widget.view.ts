import { defineView, ViewFilterOperand, ViewType } from 'twenty-sdk/define';

import {
  GATEWAY_CONTRACT,
  RELATIONS,
  WIDGET_VIEWS,
} from 'src/twenty/constants/universal-identifiers';

/**
 * Os contratos do clube aberto.
 *
 * `TABLE_WIDGET` em vez de `TABLE` para esta view nao aparecer no seletor de
 * views do indice — ela so faz sentido dentro do widget. O filtro
 * `isCurrentRecordSelected` e o que a prende ao registro aberto; sem ele o
 * widget listaria os contratos do workspace inteiro.
 */
export default defineView({
  universalIdentifier: WIDGET_VIEWS.contratosDoClube,
  name: 'Contratos do clube',
  objectUniversalIdentifier: GATEWAY_CONTRACT.object,
  type: ViewType.TABLE_WIDGET,
  icon: 'IconFileDollar',
  fields: [
    {
      universalIdentifier: 'ecd671f7-8922-4df6-89cb-3be03cb7e179',
      fieldMetadataUniversalIdentifier: GATEWAY_CONTRACT.name,
      position: 0,
      isVisible: true,
      size: 180,
    },
    {
      universalIdentifier: '8d5c97ac-6537-4a8c-aa5d-7f6c3bd8ef28',
      fieldMetadataUniversalIdentifier: GATEWAY_CONTRACT.contractStatus,
      position: 1,
      isVisible: true,
      size: 130,
    },
    {
      universalIdentifier: 'd71b7098-652c-4c27-8e2e-3b6227da0318',
      fieldMetadataUniversalIdentifier: GATEWAY_CONTRACT.totalValue,
      position: 2,
      isVisible: true,
      size: 140,
    },
    {
      universalIdentifier: '84f78160-a76b-4fe4-96df-fa91aca5b554',
      fieldMetadataUniversalIdentifier: GATEWAY_CONTRACT.nextChargeAt,
      position: 3,
      isVisible: true,
      size: 160,
    },
  ],
  filters: [
    {
      universalIdentifier: 'eb76252f-4592-461b-8c2b-bc9fd27977c0',
      fieldMetadataUniversalIdentifier: RELATIONS.companyOnContract,
      operand: ViewFilterOperand.IS,
      value: { selectedRecordIds: [], isCurrentRecordSelected: true },
    },
  ],
});
