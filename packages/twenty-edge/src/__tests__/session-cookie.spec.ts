import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { clearSessionCookie } from 'src/auth/session';
import { type AppEnv } from 'src/env';

describe('clearSessionCookie', () => {
  it('clears both cookie names without throwing on the __Host- prefix', async () => {
    const app = new Hono<AppEnv>().get('/', (context) => {
      clearSessionCookie(context);

      return context.json({ ok: true });
    });

    const response = await app.request('https://crm.campuzz.com.br/');
    const cookies = response.headers.getSetCookie();

    expect(response.status).toBe(200);
    expect(cookies).toHaveLength(2);

    const hostCookie = cookies.find((cookie) =>
      cookie.startsWith('__Host-twenty-session='),
    );

    // Hono refuses to emit a __Host- cookie without Secure, so sign-out used to
    // throw here instead of clearing anything.
    expect(hostCookie).toContain('Secure');
    expect(cookies.some((cookie) => cookie.startsWith('twenty-session='))).toBe(
      true,
    );
  });
});
