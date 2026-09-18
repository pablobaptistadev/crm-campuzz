import { defineFrontComponent } from 'twenty-sdk/define';

import { FRONT_COMPONENTS } from 'src/twenty/constants/universal-identifiers';
import { AdicionarContratoForm } from 'src/twenty/front-components/adicionar-contrato.component';

const AdicionarContratoClube = () => (
  <AdicionarContratoForm targetType="COMPANY" />
);

export default defineFrontComponent({
  universalIdentifier: FRONT_COMPONENTS.adicionarContratoClube,
  name: 'adicionar-contrato-clube',
  description: 'Vincula um contrato do gateway a um clube.',
  component: AdicionarContratoClube,
});
