import { defineFrontComponent } from 'twenty-sdk/define';

import { FRONT_COMPONENTS } from 'src/twenty/constants/universal-identifiers';
import { FinanceiroPanel } from 'src/twenty/front-components/financeiro-panel.component';

const FinanceiroMembro = () => <FinanceiroPanel targetType="PERSON" />;

export default defineFrontComponent({
  universalIdentifier: FRONT_COMPONENTS.financeiroMembro,
  name: 'financeiro-membro',
  description:
    'Resumo do financeiro do membro, atualizado no gateway ao abrir a aba.',
  component: FinanceiroMembro,
});
