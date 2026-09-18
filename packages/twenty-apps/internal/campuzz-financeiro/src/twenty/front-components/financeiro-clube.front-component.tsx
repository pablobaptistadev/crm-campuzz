import { defineFrontComponent } from 'twenty-sdk/define';

import { FRONT_COMPONENTS } from 'src/twenty/constants/universal-identifiers';
import { FinanceiroPanel } from 'src/twenty/front-components/financeiro-panel.component';

const FinanceiroClube = () => <FinanceiroPanel targetType="COMPANY" />;

export default defineFrontComponent({
  universalIdentifier: FRONT_COMPONENTS.financeiroClube,
  name: 'financeiro-clube',
  description:
    'Resumo do financeiro do clube, atualizado no gateway ao abrir a aba.',
  component: FinanceiroClube,
});
