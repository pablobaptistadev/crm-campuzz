import { defineLogicFunction } from 'twenty-sdk/define';

import { syncContractInvoices } from 'src/core/use-cases/sync-contract-invoices.use-case';
import { buildContainer } from 'src/infrastructure/container';
import { LOGIC_FUNCTIONS } from 'src/twenty/constants/universal-identifiers';

/**
 * A rede de seguranca do webhook.
 *
 * Entrega de webhook nao e garantida, e a Routerfy nao assina nem garante
 * reenvio. Sem esta passada, uma fatura paga cujo evento se perdeu fica "a
 * pagar" na tela para sempre — e a aba passa a mentir sem avisar ninguem.
 *
 * De madrugada porque e quando a janela e mais barata dos dois lados, e porque
 * uma diferenca de horas nao muda decisao nenhuma sobre cobranca.
 */
export const syncContractsHandler = async () => {
  const container = buildContainer();
  const result = await syncContractInvoices(container);

  console.log(
    JSON.stringify({
      level: 'info',
      scope: 'campuzz-financeiro.sync',
      ...result,
    }),
  );

  return { success: true, ...result };
};

export default defineLogicFunction({
  universalIdentifier: LOGIC_FUNCTIONS.syncContracts,
  name: 'campuzz-financeiro-sincronizar',
  description:
    'Rele os contratos ativos no gateway e reconcilia as faturas que o webhook nao trouxe.',
  timeoutSeconds: 900,
  handler: syncContractsHandler,
  cronTriggerSettings: { pattern: '0 4 * * *' },
});
