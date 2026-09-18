import { type Client } from 'pg';

import { type GatewayCredential } from 'src/financeiro/core/domain/entities/business-unit.entity';
import { type CredentialVaultPort } from 'src/financeiro/core/ports/credential-vault.port';

const toBase64 = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes));

// Uint8Array<ArrayBuffer>, e não o Uint8Array<ArrayBufferLike> padrão: o
// BufferSource do WebCrypto recusa uma view que possa estar sobre um
// SharedArrayBuffer.
const fromBase64 = (value: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

const NONCE_BYTES = 12;

// Ficar fora da API de records já era o que o desenho original pedia. Cifrar em
// cima disso custa uma derivação por escrita e cobre o caso em que o dump do
// banco sai de casa — que é exatamente como uma chave de gateway vaza na
// prática, não por alguém consultando o CRM.
const derivarChave = async (appSecret: string): Promise<CryptoKey> => {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    'HKDF',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('campuzz-financeiro-cofre'),
      info: new Uint8Array(),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
};

const cifrar = async (
  appSecret: string,
  credencial: GatewayCredential,
): Promise<string> => {
  const chave = await derivarChave(appSecret);
  const nonce = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(NONCE_BYTES)));

  const cifra = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    chave,
    new TextEncoder().encode(JSON.stringify(credencial)),
  );

  return `${toBase64(nonce)}.${toBase64(new Uint8Array(cifra))}`;
};

const decifrar = async (
  appSecret: string,
  guardado: string,
): Promise<GatewayCredential> => {
  const [nonce, cifra] = guardado.split('.');

  if (nonce === undefined || cifra === undefined) {
    throw new Error('A credencial guardada não está no formato esperado');
  }

  const chave = await derivarChave(appSecret);

  const aberto = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(nonce) },
    chave,
    fromBase64(cifra),
  );

  return JSON.parse(new TextDecoder().decode(aberto)) as GatewayCredential;
};

export const cofreEmPostgres = ({
  client,
  workspaceId,
  appSecret,
}: {
  client: Client;
  workspaceId: string;
  appSecret: string;
}): CredentialVaultPort => ({
  read: async (businessUnitId) => {
    const { rows } = await client.query<{ cifra: string }>(
      `SELECT "cifra" FROM core."gatewayCredential"
       WHERE "businessUnitId" = $1 AND "workspaceId" = $2`,
      [businessUnitId, workspaceId],
    );

    const guardado = rows[0]?.cifra;

    return guardado === undefined
      ? null
      : await decifrar(appSecret, guardado);
  },

  write: async (businessUnitId, credential) => {
    await client.query(
      `INSERT INTO core."gatewayCredential"
         ("businessUnitId","workspaceId","cifra")
       VALUES ($1, $2, $3)
       ON CONFLICT ("businessUnitId") DO UPDATE
         SET "cifra" = EXCLUDED."cifra", "updatedAt" = now()`,
      [businessUnitId, workspaceId, await cifrar(appSecret, credential)],
    );
  },

  erase: async (businessUnitId) => {
    await client.query(
      `DELETE FROM core."gatewayCredential"
       WHERE "businessUnitId" = $1 AND "workspaceId" = $2`,
      [businessUnitId, workspaceId],
    );
  },
});
