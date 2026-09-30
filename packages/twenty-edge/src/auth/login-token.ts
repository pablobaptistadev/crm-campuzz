import { SignJWT, jwtVerify } from 'jose';

const LOGIN_TOKEN_LIFETIME_SECONDS = 15 * 60;
const ISSUER = 'twenty-edge';
const AUDIENCE = 'login';

const toKey = (appSecret: string): Uint8Array =>
  new TextEncoder().encode(appSecret);

// The login token is the short-lived hand-off between "credentials verified" and
// "session cookie issued". It is deliberately not the session itself, so the
// value can safely travel in a URL during the multi-workspace redirect.
export const issueLoginToken = async ({
  appSecret,
  userId,
}: {
  appSecret: string;
  userId: string;
}): Promise<{ token: string; expiresAt: string }> => {
  const expiresAt = new Date(Date.now() + LOGIN_TOKEN_LIFETIME_SECONDS * 1000);

  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(expiresAt)
    .sign(toKey(appSecret));

  return { token, expiresAt: expiresAt.toISOString() };
};

export const verifyLoginToken = async ({
  appSecret,
  token,
}: {
  appSecret: string;
  token: string;
}): Promise<string | null> => {
  try {
    const { payload } = await jwtVerify(token, toKey(appSecret), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
};
