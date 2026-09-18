import {
  definePageLayoutTab,
  PageLayoutTabLayoutMode,
  STANDARD_PAGE_LAYOUT,
} from 'twenty-sdk/define';

import {
  FRONT_COMPONENTS,
  PAGE_LAYOUT_TABS,
  PAGE_LAYOUT_WIDGETS,
  RELATIONS,
  WIDGET_VIEWS,
} from 'src/twenty/constants/universal-identifiers';

/**
 * A aba Financeiro na ficha do Clube.
 *
 * E uma aba avulsa presa ao layout padrao, nao um layout novo: redefinir o
 * layout do Company substituiria as abas nativas dele, e Tarefas, Notas e
 * Arquivos sumiriam do objeto mais usado do CRM. Anexar so acrescenta.
 *
 * Os widgets sao FIELD + TABLE, nao RECORD_TABLE: RECORD_TABLE nao tem filtro
 * pelo registro aberto e listaria o workspace inteiro. As faturas chegam em dois
 * saltos — clube -> contratos -> faturas — pelo `nestedRelationFieldMetadataId`.
 */
export default definePageLayoutTab({
  universalIdentifier: PAGE_LAYOUT_TABS.financeiroClube,
  pageLayoutUniversalIdentifier:
    STANDARD_PAGE_LAYOUT.companyRecordPage.universalIdentifier,
  title: 'Financeiro',
  position: 25,
  icon: 'IconCurrencyReal',
  layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
  widgets: [
    {
      universalIdentifier: PAGE_LAYOUT_WIDGETS.painelClube,
      title: 'Resumo',
      type: 'FRONT_COMPONENT',
      configuration: {
        configurationType: 'FRONT_COMPONENT',
        frontComponentUniversalIdentifier: FRONT_COMPONENTS.financeiroClube,
      },
    },
    {
      universalIdentifier: PAGE_LAYOUT_WIDGETS.contratosClube,
      title: 'Contratos',
      type: 'FIELD',
      configuration: {
        configurationType: 'FIELD',
        fieldMetadataId: RELATIONS.contractsOnCompany,
        fieldDisplayMode: 'TABLE',
        viewId: WIDGET_VIEWS.contratosDoClube,
      },
    },
    {
      universalIdentifier: PAGE_LAYOUT_WIDGETS.faturasAPagarClube,
      title: 'Faturas a pagar',
      type: 'FIELD',
      configuration: {
        configurationType: 'FIELD',
        fieldMetadataId: RELATIONS.contractsOnCompany,
        nestedRelationFieldMetadataId: RELATIONS.invoicesOnContract,
        fieldDisplayMode: 'TABLE',
        viewId: WIDGET_VIEWS.faturasAPagarWidget,
      },
    },
    {
      universalIdentifier: PAGE_LAYOUT_WIDGETS.faturasPagasClube,
      title: 'Faturas pagas',
      type: 'FIELD',
      configuration: {
        configurationType: 'FIELD',
        fieldMetadataId: RELATIONS.contractsOnCompany,
        nestedRelationFieldMetadataId: RELATIONS.invoicesOnContract,
        fieldDisplayMode: 'TABLE',
        viewId: WIDGET_VIEWS.faturasPagasWidget,
      },
    },
  ],
});
