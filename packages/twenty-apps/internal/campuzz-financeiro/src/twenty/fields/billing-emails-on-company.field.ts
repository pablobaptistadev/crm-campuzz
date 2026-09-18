import {
  defineField,
  FieldType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { RELATIONS } from 'src/twenty/constants/universal-identifiers';

/**
 * O e-mail de cobranca do Clube.
 *
 * Existe porque Company, no Twenty, nao tem e-mail nenhum — Person tem
 * `emails`, Company nao. Sem este campo, a trava que confere o titular do
 * contrato no gateway nao teria o que comparar do lado do clube, e vincular
 * contrato de clube viraria um ato de fe.
 */
export default defineField({
  universalIdentifier: RELATIONS.billingEmailsOnCompany,
  objectUniversalIdentifier:
    STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
  type: FieldType.EMAILS,
  name: 'billingEmails',
  label: 'E-mails de cobranca',
  description:
    'O e-mail com que este clube aparece no gateway. Conferimos o contrato contra ele antes de vincular.',
  icon: 'IconMailDollar',
});
