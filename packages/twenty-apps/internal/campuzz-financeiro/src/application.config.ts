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
  serverVariables: {
    ROUTERFY_API_URL: {
      description:
        'Base da API da Routerfy. So precisa ser definida para apontar para outro ambiente (sandbox, homologacao); em branco usamos https://api.routerfy.com, que e o mesmo default do Campuzz.',
      isSecret: false,
      isRequired: false,
    },
  },
});
