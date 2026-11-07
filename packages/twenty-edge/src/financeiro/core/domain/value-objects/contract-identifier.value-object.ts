/**
 * O que a pessoa digita no campo "contrato ou transacao".
 *
 * Aceita tanto o numero do painel (`code`) quanto o id interno do gateway, e nao
 * tenta adivinhar qual e qual: quem sabe distinguir e o gateway, tentando os dois
 * caminhos. Aqui so normalizamos e garantimos que nao esta vazio.
 */
export type ContractIdentifier = {
  readonly value: string;
};

const MINIMUM_LENGTH = 3;

export const isValidContractIdentifier = (raw: string): boolean =>
  raw.trim().length >= MINIMUM_LENGTH;

export const contractIdentifierFrom = (raw: string): ContractIdentifier => ({
  value: raw.trim(),
});
