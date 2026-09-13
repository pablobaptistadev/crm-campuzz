import { type Bindings } from 'src/env';

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type EmailResult =
  | { delivered: true }
  | { delivered: false; reason: string };

// SMTP does not exist inside a Worker — there are no raw sockets on port 587 —
// so the provider has to speak HTTP. SendGrid's v3 API it is. Its SMTP
// credentials are the same secret wearing a different hat: the username is
// literally "apikey" and the password is the API key, so a SendGrid SMTP block
// already contains what this needs.
const SENDGRID_ENDPOINT = 'https://api.sendgrid.com/v3/mail/send';

// SendGrid answers 202 Accepted, not 200, and with an empty body. Anything else
// carries {errors: [{message, field}]} worth reading back to whoever invited.
const readFailureReason = async (response: Response): Promise<string> => {
  const body = await response.text().catch(() => '');

  try {
    const parsed: unknown = JSON.parse(body);
    const errors = (parsed as { errors?: { message?: string }[] }).errors;

    if (Array.isArray(errors) && errors.length > 0) {
      return errors
        .map((error) => error.message ?? '')
        .filter((message) => message.length > 0)
        .join('; ');
    }
  } catch {
    // Not JSON — the raw body is still the most useful thing we have.
  }

  return body.slice(0, 200);
};

export const sendEmail = async ({
  bindings,
  message,
}: {
  bindings: Bindings;
  message: EmailMessage;
}): Promise<EmailResult> => {
  const apiKey = bindings.SENDGRID_API_KEY ?? '';
  const from = bindings.EMAIL_FROM ?? '';

  // Not configured is not an error: an invitation is still created and its link
  // still works, the person just has to receive it another way. Failing the
  // whole mutation would make the feature unusable until the key arrives.
  if (apiKey.length === 0 || from.length === 0) {
    return {
      delivered: false,
      reason:
        'E-mail não configurado: defina SENDGRID_API_KEY e EMAIL_FROM para enviarmos o convite',
    };
  }

  const response = await fetch(SENDGRID_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: message.to }] }],
      from: { email: from },
      subject: message.subject,
      // Order matters to SendGrid: it sends the last part as the preferred one,
      // so text/plain has to come before text/html.
      content: [
        { type: 'text/plain', value: message.text },
        { type: 'text/html', value: message.html },
      ],
    }),
  });

  if (!response.ok) {
    return {
      delivered: false,
      reason: `Não conseguimos enviar o e-mail (${response.status}): ${await readFailureReason(response)}`,
    };
  }

  return { delivered: true };
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const buildInvitationEmail = ({
  to,
  workspaceName,
  inviterName,
  link,
}: {
  to: string;
  workspaceName: string;
  inviterName: string | null;
  link: string;
}): EmailMessage => {
  const invitedBy =
    inviterName === null ? '' : ` por ${escapeHtml(inviterName)}`;

  return {
    to,
    subject: `Convite para o ${workspaceName}`,
    text: [
      `Você foi convidado${inviterName === null ? '' : ` por ${inviterName}`} para o ${workspaceName}.`,
      '',
      `Acesse: ${link}`,
      '',
      'Se não esperava este convite, pode ignorar esta mensagem.',
    ].join('\n'),
    html: `<!doctype html>
<html lang="pt-BR"><body style="font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.6; color: #1b1b1b">
  <p>Você foi convidado${invitedBy} para o <strong>${escapeHtml(workspaceName)}</strong>.</p>
  <p><a href="${escapeHtml(link)}" style="display: inline-block; padding: 10px 18px; background: #1b1b1b; color: #fff; border-radius: 6px; text-decoration: none">Aceitar o convite</a></p>
  <p style="color: #6b6b6b; font-size: 13px">Se não esperava este convite, pode ignorar esta mensagem.</p>
</body></html>`,
  };
};
