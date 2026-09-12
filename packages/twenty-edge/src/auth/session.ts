import { type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

import { type AppEnv } from 'src/env';

// The __Host- prefix forbids a Domain attribute, which is what pins the cookie
// to the exact API host. It also requires Secure, so plain-HTTP dev has to fall
// back to the unprefixed name — and sign-out must clear both, since a
// deployment can move between the two.
export const SECURE_SESSION_COOKIE_NAME = '__Host-twenty-session';
export const SESSION_COOKIE_NAME = 'twenty-session';

const SESSION_TOKEN_BYTE_LENGTH = 32;
const SESSION_LIFETIME_MS = 60 * 24 * 60 * 60 * 1000;

export type IssuedSessionToken = { token: string; tokenHash: string; expiresAt: Date };

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

// Only the hash reaches the database, so a dump of core."userSession" cannot be
// replayed as a live cookie.
export const hashSessionToken = async (token: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  );

  return toHex(new Uint8Array(digest));
};

export const issueSessionToken = async (): Promise<IssuedSessionToken> => {
  const token = toHex(
    crypto.getRandomValues(new Uint8Array(SESSION_TOKEN_BYTE_LENGTH)),
  );

  return {
    token,
    tokenHash: await hashSessionToken(token),
    expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
  };
};

const isSecureDeployment = (context: Context<AppEnv>): boolean =>
  new URL(context.env.SERVER_URL).protocol === 'https:';

export const resolveSessionCookieName = (context: Context<AppEnv>): string =>
  isSecureDeployment(context) ? SECURE_SESSION_COOKIE_NAME : SESSION_COOKIE_NAME;

export const attachSessionCookie = (
  context: Context<AppEnv>,
  { token, expiresAt }: IssuedSessionToken,
): void => {
  const isSecure = isSecureDeployment(context);

  setCookie(context, resolveSessionCookieName(context), token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'Lax',
    path: '/',
    expires: expiresAt,
  });
};

export const readSessionToken = (context: Context<AppEnv>): string | null =>
  getCookie(context, SECURE_SESSION_COOKIE_NAME) ??
  getCookie(context, SESSION_COOKIE_NAME) ??
  null;

export const clearSessionCookie = (context: Context<AppEnv>): void => {
  for (const cookieName of [SECURE_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME]) {
    deleteCookie(context, cookieName, { path: '/' });
  }
};
