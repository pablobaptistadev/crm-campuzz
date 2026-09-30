/**
 * E-mail comparado do jeito que o gateway compara.
 *
 * A trava que impede vincular o contrato de outra pessoa depende desta
 * comparacao. Ela e `trim` + `lowercase` porque o customer cadastrado no gateway
 * quase sempre diverge do digitado por espaco ou caixa, e recusar por isso seria
 * recusar o caso certo.
 */
export type EmailAddress = {
  readonly value: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emailAddressFrom = (raw: string): EmailAddress => ({
  value: raw.trim().toLowerCase(),
});

export const isValidEmailAddress = (raw: string): boolean =>
  EMAIL_PATTERN.test(raw.trim());

export const emailAddressEquals = (
  left: EmailAddress,
  right: EmailAddress,
): boolean => left.value === right.value;
