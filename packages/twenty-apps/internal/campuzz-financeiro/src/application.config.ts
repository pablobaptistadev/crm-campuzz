import { defineApplication } from 'twenty-sdk/define';

export const APPLICATION_UNIVERSAL_IDENTIFIER =
  'cea1e3b9-a038-4424-9a5b-650ec210a1de';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: 'Campuzz Financeiro',
  description:
    'Contratos e faturas dos gateways de pagamento, vinculados a Clubes e Membros. A Routerfy e o primeiro gateway; outros entram como adaptadores.',
  author: 'Campuzz',
  category: 'Other',
});
