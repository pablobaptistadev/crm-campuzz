// PBKDF2 over WebCrypto. bcrypt is a native addon and cannot load in an isolate;
// starting from an empty database means we carry no $2a$/$2b$ hashes to verify,
// so there is no reason to ship a pure-JS bcrypt.
// Workers hard-caps PBKDF2 at 100k iterations: asking for more fails with
// "iteration counts above 100000 are not supported". That is below the 600k
// OWASP recommends for PBKDF2-SHA256, so the count is stored inside the hash —
// verification reads it back, and raising it later needs no migration.
const PBKDF2_ITERATIONS = 100_000;
const MAX_SUPPORTED_ITERATIONS = 100_000;
const SALT_BYTE_LENGTH = 16;
const DERIVED_KEY_BIT_LENGTH = 256;
const HASH_PREFIX = 'pbkdf2-sha256';

const toBase64 = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes));

// Uint8Array<ArrayBuffer>, not the default Uint8Array<ArrayBufferLike>: WebCrypto's
// BufferSource rejects a view that might sit on a SharedArrayBuffer.
const fromBase64 = (value: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

const deriveKey = async (
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array<ArrayBuffer>> => {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    DERIVED_KEY_BIT_LENGTH,
  );

  return new Uint8Array(derivedBits);
};

// WebCrypto has no timingSafeEqual, and comparing hashes with === leaks the
// match position through timing.
const areBytesEqual = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < left.length; index++) {
    difference |= left[index] ^ right[index];
  }

  return difference === 0;
};

export const hashPassword = async (password: string): Promise<string> => {
  const salt = crypto.getRandomValues(
    new Uint8Array(new ArrayBuffer(SALT_BYTE_LENGTH)),
  );
  const derivedKey = await deriveKey(password, salt, PBKDF2_ITERATIONS);

  return `${HASH_PREFIX}$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(derivedKey)}`;
};

export const verifyPassword = async (
  password: string,
  storedHash: string,
): Promise<boolean> => {
  const [prefix, iterationsPart, saltPart, hashPart] = storedHash.split('$');

  if (prefix !== HASH_PREFIX || !iterationsPart || !saltPart || !hashPart) {
    return false;
  }

  const iterations = Number(iterationsPart);

  if (
    !Number.isInteger(iterations) ||
    iterations <= 0 ||
    iterations > MAX_SUPPORTED_ITERATIONS
  ) {
    return false;
  }

  const derivedKey = await deriveKey(password, fromBase64(saltPart), iterations);

  return areBytesEqual(derivedKey, fromBase64(hashPart));
};
