import { type ClockPort } from 'src/financeiro/core/ports/clock.port';
import { type IdentifierGeneratorPort } from 'src/financeiro/core/ports/identifier-generator.port';

export const relogioDoSistema: ClockPort = {
  nowIso: () => new Date().toISOString(),
};

// crypto.randomUUID é v4 sobre a fonte de entropia do isolate. O registrationId
// sai daqui e vai numa URL pública, então imprevisível não é preferência.
export const identificadorDoSistema: IdentifierGeneratorPort = {
  generate: () => crypto.randomUUID(),
};
