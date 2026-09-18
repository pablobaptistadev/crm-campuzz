import {
  defineCommandMenuItem,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  COMMAND_MENU_ITEMS,
  FRONT_COMPONENTS,
} from 'src/twenty/constants/universal-identifiers';

export default defineCommandMenuItem({
  universalIdentifier: COMMAND_MENU_ITEMS.adicionarContratoClube,
  availabilityObjectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  frontComponentUniversalIdentifier: FRONT_COMPONENTS.adicionarContratoClube,
  label: 'Adicionar contrato',
  shortLabel: 'Contrato',
  availabilityType: 'RECORD_SELECTION',
});
