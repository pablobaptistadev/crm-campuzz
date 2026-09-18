import { createHash, randomUUID } from 'node:crypto';

import { type ClockPort } from 'src/core/ports/clock.port';
import { type IdentifierGeneratorPort } from 'src/core/ports/identifier-generator.port';

export const systemClock: ClockPort = {
  nowIso: () => new Date().toISOString(),
};

export const uuidIdentifierGenerator: IdentifierGeneratorPort = {
  generate: () => randomUUID(),
};

/**
 * Impressao digital da api key.
 *
 * Guardamos o hash, nao a chave, porque isto fica num campo de registro que
 * qualquer pessoa com leitura enxerga. Serve para uma coisa so: dizer se o
 * evento que chegou pertence a esta BU.
 */
export const fingerprintOf = (apiKey: string): string =>
  createHash('sha256').update(apiKey.trim()).digest('hex');
