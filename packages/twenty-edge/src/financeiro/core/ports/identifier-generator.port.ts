/**
 * Gerador de ids opacos.
 *
 * O `registrationId` que vai na URL do webhook sai daqui. Ele e a unica coisa
 * que separa uma entrega legitima de um POST de quem descobriu a rota, entao
 * precisa ser imprevisivel — e o caso de uso precisa poder ser testado com um
 * gerador fixo.
 */
export type IdentifierGeneratorPort = {
  generate(): string;
};
