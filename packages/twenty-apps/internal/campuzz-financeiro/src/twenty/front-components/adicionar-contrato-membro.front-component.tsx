import { defineFrontComponent } from 'twenty-sdk/define';

import { FRONT_COMPONENTS } from 'src/twenty/constants/universal-identifiers';
import { AdicionarContratoForm } from 'src/twenty/front-components/adicionar-contrato.component';

/**
 * Sao dois componentes, um por tipo de registro, porque o contexto de execucao
 * nao diz de qual objeto a acao partiu — ele entrega os ids selecionados e mais
 * nada. Cada command menu item aponta para o seu, e o tipo fica decidido no
 * registro em vez de adivinhado em tempo de execucao.
 */
const AdicionarContratoMembro = () => (
  <AdicionarContratoForm targetType="PERSON" />
);

export default defineFrontComponent({
  universalIdentifier: FRONT_COMPONENTS.adicionarContratoMembro,
  name: 'adicionar-contrato-membro',
  description: 'Vincula um contrato do gateway a um membro.',
  component: AdicionarContratoMembro,
});
