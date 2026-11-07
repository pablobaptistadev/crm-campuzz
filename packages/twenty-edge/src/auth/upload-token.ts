import { SignJWT, jwtVerify } from 'jose';

const UPLOAD_TOKEN_LIFETIME_SECONDS = 60 * 60;
const ISSUER = 'twenty-edge';
const AUDIENCE = 'file-upload';

const toKey = (appSecret: string): Uint8Array =>
  new TextEncoder().encode(appSecret);

export type UploadTokenClaims = { workspaceId: string; fileId: string };

// The browser uploads straight to the Worker, so the URL it is handed has to
// carry its own authority: the cookie is not sent on a cross-origin PUT, and
// the URL may outlive the page that created it.
export const issueUploadToken = async ({
  appSecret,
  workspaceId,
  fileId,
}: {
  appSecret: string;
  workspaceId: string;
  fileId: string;
}): Promise<{ token: string; expiresAt: Date }> => {
  const expiresAt = new Date(Date.now() + UPLOAD_TOKEN_LIFETIME_SECONDS * 1000);

  const token = await new SignJWT({ workspaceId, fileId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(expiresAt)
    .setSubject(fileId)
    .sign(toKey(appSecret));

  return { token, expiresAt };
};

export const verifyUploadToken = async ({
  appSecret,
  token,
}: {
  appSecret: string;
  token: string;
}): Promise<UploadTokenClaims | null> => {
  try {
    const { payload } = await jwtVerify(token, toKey(appSecret), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    const { workspaceId, fileId } = payload as Record<string, unknown>;

    if (typeof workspaceId !== 'string' || typeof fileId !== 'string') {
      return null;
    }

    return { workspaceId, fileId };
  } catch {
    return null;
  }
};
