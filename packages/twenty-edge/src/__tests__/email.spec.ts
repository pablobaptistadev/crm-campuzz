import { describe, expect, it, vi } from 'vitest';

import { buildInvitationEmail, sendEmail } from 'src/services/email';
import { type Bindings } from 'src/env';

const bindings = (overrides: Partial<Bindings> = {}) =>
  ({
    SENDGRID_API_KEY: 'SG.test',
    EMAIL_FROM: 'nao-responda@campuzz.com.br',
    ...overrides,
  }) as Bindings;

const message = {
  to: 'alguem@example.com',
  subject: 'Convite',
  html: '<p>oi</p>',
  text: 'oi',
};

describe('sendEmail', () => {
  // Not configured is not a failure of the invitation: the row exists and its
  // link works, so the caller is told what is missing rather than the whole
  // mutation dying until a key arrives.
  it('says what is missing when it is not configured', async () => {
    for (const missing of [
      { SENDGRID_API_KEY: undefined },
      { EMAIL_FROM: undefined },
    ]) {
      const result = await sendEmail({
        bindings: bindings(missing),
        message,
      });

      expect(result).toEqual({
        delivered: false,
        reason: expect.stringContaining('SENDGRID_API_KEY'),
      });
    }
  });

  it('posts the shape SendGrid expects', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 202 }));

    const result = await sendEmail({ bindings: bindings(), message });

    expect(result).toEqual({ delivered: true });

    const [url, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String((init as RequestInit).body));

    expect(url).toBe('https://api.sendgrid.com/v3/mail/send');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer SG.test',
    });
    expect(body.personalizations).toEqual([
      { to: [{ email: 'alguem@example.com' }] },
    ]);
    expect(body.from).toEqual({ email: 'nao-responda@campuzz.com.br' });

    // SendGrid sends the LAST content part as the preferred one, so plain text
    // has to come first or every message arrives as source.
    expect(body.content.map((part: { type: string }) => part.type)).toEqual([
      'text/plain',
      'text/html',
    ]);

    fetchMock.mockRestore();
  });

  // 202, not 200 — treating only 200 as success would report every delivered
  // message as failed.
  it('accepts 202 as delivered', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 202 }));

    expect(await sendEmail({ bindings: bindings(), message })).toEqual({
      delivered: true,
    });

    fetchMock.mockRestore();
  });

  it('reads SendGrid’s own error message back', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          errors: [{ message: 'The from address does not match a verified Sender Identity.' }],
        }),
        { status: 403 },
      ),
    );

    const result = await sendEmail({ bindings: bindings(), message });

    expect(result).toEqual({
      delivered: false,
      reason: expect.stringContaining('verified Sender Identity'),
    });

    fetchMock.mockRestore();
  });

  it('falls back to the raw body when the error is not JSON', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('gateway timeout', { status: 504 }));

    const result = await sendEmail({ bindings: bindings(), message });

    expect(result).toEqual({
      delivered: false,
      reason: expect.stringContaining('gateway timeout'),
    });

    fetchMock.mockRestore();
  });
});

describe('buildInvitationEmail', () => {
  it('carries the link in both parts', () => {
    const built = buildInvitationEmail({
      to: 'alguem@example.com',
      workspaceName: 'Campuzz',
      inviterName: 'Pablo',
      link: 'https://crm.campuzz.com.br/invite/abc',
    });

    expect(built.text).toContain('https://crm.campuzz.com.br/invite/abc');
    expect(built.html).toContain('https://crm.campuzz.com.br/invite/abc');
    expect(built.subject).toContain('Campuzz');
  });

  // The name reaches the message from the database, so it is escaped like any
  // other untrusted string.
  it('escapes the inviter name', () => {
    const built = buildInvitationEmail({
      to: 'alguem@example.com',
      workspaceName: 'Campuzz',
      inviterName: '<script>alert(1)</script>',
      link: 'https://crm.campuzz.com.br/invite/abc',
    });

    expect(built.html).not.toContain('<script>');
    expect(built.html).toContain('&lt;script&gt;');
  });
});
