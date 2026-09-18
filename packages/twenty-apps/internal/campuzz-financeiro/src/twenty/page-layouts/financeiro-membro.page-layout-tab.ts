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
 * A aba Financeiro na ficha do Membro.
 *
 * E uma aba avulsa presa ao layout padrao, nao um layout novo: redefinir o
 * layout do Person substituiria as abas nativas dele, e Tarefas, Notas e
 * Arquivos sumiriam do objeto mais usado do CRM. Anexar so acrescenta.
 *
 * Os widgets sao FIELD + TABLE, nao RECORD_TABLE: RECORD_TABLE nao tem filtro
 * pelo registro aberto e listaria o workspace inteiro. As faturas chegam em dois
 * saltos — membro -> contratos -> faturas — pelo `nestedRelationFieldMetadataId`.
 */
export default definePageLayoutTab({
  universalIdentifier: PAGE_LAYOUT_TABS.financeiroMembro,
  pageLayoutUniversalIdentifier:
    STANDARD_PAGE_LAYOUT.personRecordPage.universalIdentifier,
  title: 'Financeiro',
  position: 25,
  icon: 'IconCurrencyReal',
  layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
  widgets: [
    {
      universalIdentifier: PAGE_LAYOUT_WIDGETS.painelMembro,
      title: 'Resumo',
      type: 'FRONT_COMPONENT',
      configuration: {
        configurationType: 'FRONT_COMPONENT',
        frontComponentUniversalIdentifier: FRONT_COMPONENTS.financeiroMembro,
      },
    },
    {
      universalIdentifier: PAGE_LAYOUT_WIDGETS.contratosMembro,
      title: 'Contratos',
      type: 'FIELD',
      configuration: {
        configurationType: 'FIELD',
        fieldMetadataId: RELATIONS.contractsOnPerson,
        fieldDisplayMode: 'TABLE',
        viewId: WIDGET_VIEWS.contratosDoMembro,
      },
    },
    {
      universalIdentifier: PAGE_LAYOUT_WIDGETS.faturasAPagarMembro,
      title: 'Faturas a pagar',
      type: 'FIELD',
      configuration: {
        configurationType: 'FIELD',
        fieldMetadataId: RELATIONS.contractsOnPerson,
        nestedRelationFieldMetadataId: RELATIONS.invoicesOnContract,
        fieldDisplayMode: 'TABLE',
        viewId: WIDGET_VIEWS.faturasAPagarWidget,
      },
    },
    {
      universalIdentifier: PAGE_LAYOUT_WIDGETS.faturasPagasMembro,
      title: 'Faturas pagas',
      type: 'FIELD',
      configuration: {
        configurationType: 'FIELD',
        fieldMetadataId: RELATIONS.contractsOnPerson,
        nestedRelationFieldMetadataId: RELATIONS.invoicesOnContract,
        fieldDisplayMode: 'TABLE',
        viewId: WIDGET_VIEWS.faturasPagasWidget,
      },
    },
  ],
});
