import { type CampoMeta, type ObjetoMeta } from './metadata';

// Cada campo composto vira N colunas no banco e um objeto no GraphQL; a
// sub-seleção aqui é a mesma que o editor lê e escreve.
const SUBSELECAO: Partial<Record<CampoMeta['type'], string>> = {
  CURRENCY: '{ amountMicros currencyCode }',
  EMAILS: '{ primaryEmail }',
  PHONES: '{ primaryPhoneNumber primaryPhoneCallingCode }',
  LINKS: '{ primaryLinkUrl primaryLinkLabel }',
  ADDRESS:
    '{ addressStreet1 addressStreet2 addressCity addressState addressPostcode addressCountry }',
};

// Relação não é valor do registro, é outra tabela — quem precisa dela escreve a
// própria sub-consulta. ACTOR e POSITION são do sistema e não se editam.
const FORA_DO_CADASTRO = new Set(['RELATION', 'MORPH_RELATION', 'ACTOR', 'POSITION']);

// A lista sai do metadata, não de um array escrito à mão: um campo criado
// depois já aparece na tela, e nenhum campo existente fica de fora por
// esquecimento — que era o que acontecia com a lista fixa.
export const camposDoCadastro = (objeto: ObjetoMeta): CampoMeta[] =>
  [...objeto.campoPorNome.values()].filter(
    (campo) => !campo.isSystem && !FORA_DO_CADASTRO.has(campo.type),
  );

export const selecaoDeCampos = (objeto: ObjetoMeta): string =>
  ['id', ...camposDoCadastro(objeto).map((campo) => `${campo.name} ${SUBSELECAO[campo.type] ?? ''}`)]
    .join('\n      ')
    .trim();
