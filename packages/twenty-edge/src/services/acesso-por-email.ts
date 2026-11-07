import { type Client } from 'pg';

import { hashPassword } from 'src/auth/password';
import { hashSessionToken } from 'src/auth/session';
import { isClubeHostname } from 'src/clube-hosts';
import {
  findFirstWorkspaceForUser,
  findUserByEmail,
} from 'src/db/core/auth-repository';
import {
  buildLoginCodeEmail,
  buildPasswordResetEmail,
  type EmailMessage,
} from 'src/services/email';
import { TAMANHO_MINIMO_DA_SENHA } from 'src/services/meu-perfil';

export const VALIDADE_DO_LINK_DE_SENHA_MS = 60 * 60 * 1000;
export const VALIDADE_DO_CODIGO_MS = 10 * 60 * 1000;
// Com 6 dígitos e 5 tentativas por código, a chance de acertar no chute é de
// 1 em 200 mil por código pedido, e o pedido também tem limite por e-mail.
export const TENTATIVAS_POR_CODIGO = 5;
const DIGITOS_DO_CODIGO = 6;
const BYTES_DO_LINK = 32;

export const LINK_DE_SENHA_INVALIDO =
  'O link para redefinir a senha venceu ou já foi usado. Peça um novo.';

export class ErroDeAcesso extends Error {}

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

// Comparar com === entrega pelo tempo de resposta em que posição o palpite
// errou.
const saoIguais = (esquerda: string, direita: string): boolean => {
  if (esquerda.length !== direita.length) {
    return false;
  }

  let diferenca = 0;

  for (let indice = 0; indice < esquerda.length; indice++) {
    diferenca |= esquerda.charCodeAt(indice) ^ direita.charCodeAt(indice);
  }

  return diferenca === 0;
};

// Sorteio sem viés: o resto da divisão de um número aleatório favorece os
// primeiros códigos quando o intervalo não divide 2^32, então o que cai na
// sobra é descartado.
export const gerarCodigo = (): string => {
  const limite = 10 ** DIGITOS_DO_CODIGO;
  const teto = Math.floor(2 ** 32 / limite) * limite;
  const sorteio = new Uint32Array(1);

  do {
    crypto.getRandomValues(sorteio);
  } while (sorteio[0] >= teto);

  return String(sorteio[0] % limite).padStart(DIGITOS_DO_CODIGO, '0');
};

// O código tem só um milhão de valores, então um SHA-256 puro dele seria
// revertido na hora por quem lesse o banco. Com o APP_SECRET na conta, o banco
// sozinho não basta; o id do token entra para o hash nunca repetir entre duas
// pessoas que tirem o mesmo número (valueHash é único na tabela).
export const hashDoCodigo = async ({
  appSecret,
  tokenId,
  codigo,
}: {
  appSecret: string;
  tokenId: string;
  codigo: string;
}): Promise<string> => {
  const chave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const assinatura = await crypto.subtle.sign(
    'HMAC',
    chave,
    new TextEncoder().encode(`login-code:${tokenId}:${codigo}`),
  );

  return toHex(new Uint8Array(assinatura));
};

// O e-mail sai do host em que a pessoa pediu: quem usa o app de clubes volta
// para a tela dele, e quem usa o CRM volta para a página de redefinição do
// front do Twenty.
export const linkParaRedefinirSenha = (serverUrl: string, token: string): string => {
  const url = new URL(serverUrl);

  return isClubeHostname(url.hostname)
    ? `${url.origin}/redefinir-senha?token=${token}`
    : `${url.origin}/reset-password/${token}`;
};

// O token precisa de um workspace (a coluna não aceita nulo), e quem não está
// em workspace nenhum também não teria onde entrar.
const encontrarQuemPodeEntrar = async (client: Client, email: string) => {
  const user = await findUserByEmail({ client, email: email.trim() });

  if (user === null || user.disabled) {
    return null;
  }

  const membership = await findFirstWorkspaceForUser({ client, userId: user.id });

  return membership === null ? null : { user, workspaceId: membership.workspace.id };
};

// Devolve o e-mail a enviar, ou null quando não há conta. Quem chama responde
// igual nos dois casos, senão o formulário revela quais e-mails estão
// cadastrados.
export const prepararRedefinicaoDeSenha = async ({
  client,
  email,
  serverUrl,
}: {
  client: Client;
  email: string;
  serverUrl: string;
}): Promise<EmailMessage | null> => {
  const conta = await encontrarQuemPodeEntrar(client, email);

  if (conta === null) {
    return null;
  }

  const token = toHex(crypto.getRandomValues(new Uint8Array(BYTES_DO_LINK)));

  // Um pedido novo vale e os anteriores deixam de valer: o link certo é sempre
  // o do e-mail mais recente.
  await client.query(
    `UPDATE core."appToken" SET "revokedAt" = now(), "updatedAt" = now()
     WHERE "userId" = $1 AND "type" = 'PASSWORD_RESET' AND "revokedAt" IS NULL`,
    [conta.user.id],
  );

  await client.query(
    `INSERT INTO core."appToken"
       ("workspaceId","userId","type","valueHash","context","expiresAt")
     VALUES ($1,$2,'PASSWORD_RESET',$3,$4,$5)`,
    [
      conta.workspaceId,
      conta.user.id,
      await hashSessionToken(token),
      JSON.stringify({ email: conta.user.email }),
      new Date(Date.now() + VALIDADE_DO_LINK_DE_SENHA_MS),
    ],
  );

  return buildPasswordResetEmail({
    to: conta.user.email,
    firstName: conta.user.firstName,
    link: linkParaRedefinirSenha(serverUrl, token),
  });
};

export const lerRedefinicaoDeSenha = async ({
  client,
  token,
}: {
  client: Client;
  token: string;
}): Promise<{ userId: string; email: string; hasPassword: boolean } | null> => {
  const { rows } = await client.query<{
    userId: string;
    email: string;
    hasPassword: boolean;
  }>(
    `SELECT t."userId", u."email", u."passwordHash" IS NOT NULL AS "hasPassword"
     FROM core."appToken" t
     JOIN core."user" u ON u."id" = t."userId"
     WHERE t."valueHash" = $1 AND t."type" = 'PASSWORD_RESET'
       AND t."revokedAt" IS NULL AND t."expiresAt" > now()
       AND u."deletedAt" IS NULL AND u."disabled" = false`,
    [await hashSessionToken(token)],
  );

  return rows[0] ?? null;
};

export const redefinirSenha = async ({
  client,
  token,
  novaSenha,
}: {
  client: Client;
  token: string;
  novaSenha: string;
}): Promise<{ sessoesEncerradas: number }> => {
  if (novaSenha.length < TAMANHO_MINIMO_DA_SENHA) {
    throw new ErroDeAcesso(
      `A nova senha precisa ter pelo menos ${TAMANHO_MINIMO_DA_SENHA} caracteres.`,
    );
  }

  // Fora da transação: o PBKDF2 é a parte lenta e não precisa segurar nada.
  const passwordHash = await hashPassword(novaSenha);

  await client.query('BEGIN');

  try {
    // Gastar o token é o primeiro passo e é atômico: duas abas com o mesmo link
    // não trocam a senha duas vezes.
    const gasto = await client.query<{ userId: string }>(
      `UPDATE core."appToken" SET "revokedAt" = now(), "updatedAt" = now()
       WHERE "valueHash" = $1 AND "type" = 'PASSWORD_RESET'
         AND "revokedAt" IS NULL AND "expiresAt" > now()
       RETURNING "userId"`,
      [await hashSessionToken(token)],
    );

    const userId = gasto.rows[0]?.userId;

    if (userId === undefined) {
      throw new ErroDeAcesso(LINK_DE_SENHA_INVALIDO);
    }

    const atualizado = await client.query(
      `UPDATE core."user" SET "passwordHash" = $2, "updatedAt" = now()
       WHERE "id" = $1 AND "deletedAt" IS NULL AND "disabled" = false`,
      [userId, passwordHash],
    );

    if ((atualizado.rowCount ?? 0) === 0) {
      throw new ErroDeAcesso(LINK_DE_SENHA_INVALIDO);
    }

    // Quem pede para redefinir a senha pode estar fugindo de alguém que já
    // entrou na conta: toda sessão aberta cai, sem exceção.
    const encerradas = await client.query(
      `UPDATE core."userSession"
       SET "revokedAt" = now(), "revokedReason" = 'PASSWORD_RESET'
       WHERE "userId" = $1 AND "revokedAt" IS NULL`,
      [userId],
    );

    await client.query(
      `UPDATE core."appToken" SET "revokedAt" = now(), "updatedAt" = now()
       WHERE "userId" = $1 AND "type" IN ('PASSWORD_RESET','LOGIN_CODE')
         AND "revokedAt" IS NULL`,
      [userId],
    );

    await client.query('COMMIT');

    return { sessoesEncerradas: encerradas.rowCount ?? 0 };
  } catch (causa) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw causa;
  }
};

export const prepararCodigoDeAcesso = async ({
  client,
  appSecret,
  email,
}: {
  client: Client;
  appSecret: string;
  email: string;
}): Promise<EmailMessage | null> => {
  const conta = await encontrarQuemPodeEntrar(client, email);

  if (conta === null) {
    return null;
  }

  const codigo = gerarCodigo();
  const tokenId = crypto.randomUUID();

  // Só o código mais recente vale: com dois vivos, a pessoa digitaria o do
  // e-mail antigo e acharia que o novo não funciona.
  await client.query(
    `UPDATE core."appToken" SET "revokedAt" = now(), "updatedAt" = now()
     WHERE "userId" = $1 AND "type" = 'LOGIN_CODE' AND "revokedAt" IS NULL`,
    [conta.user.id],
  );

  await client.query(
    `INSERT INTO core."appToken"
       ("id","workspaceId","userId","type","valueHash","context","expiresAt")
     VALUES ($1,$2,$3,'LOGIN_CODE',$4,$5,$6)`,
    [
      tokenId,
      conta.workspaceId,
      conta.user.id,
      await hashDoCodigo({ appSecret, tokenId, codigo }),
      JSON.stringify({ tentativas: 0 }),
      new Date(Date.now() + VALIDADE_DO_CODIGO_MS),
    ],
  );

  return buildLoginCodeEmail({
    to: conta.user.email,
    firstName: conta.user.firstName,
    code: codigo,
  });
};

// Devolve o id de quem entrou, ou null. O motivo da recusa não sai daqui: para
// quem está do outro lado, conta inexistente, código vencido e código errado
// têm de parecer a mesma coisa.
export const conferirCodigoDeAcesso = async ({
  client,
  appSecret,
  email,
  codigo,
}: {
  client: Client;
  appSecret: string;
  email: string;
  codigo: string;
}): Promise<string | null> => {
  const digitado = codigo.replace(/\s+/g, '');

  if (!new RegExp(`^\\d{${DIGITOS_DO_CODIGO}}$`).test(digitado)) {
    return null;
  }

  const conta = await encontrarQuemPodeEntrar(client, email);

  if (conta === null) {
    return null;
  }

  const { rows } = await client.query<{ id: string; valueHash: string }>(
    `SELECT "id","valueHash" FROM core."appToken"
     WHERE "userId" = $1 AND "type" = 'LOGIN_CODE'
       AND "revokedAt" IS NULL AND "expiresAt" > now()
     ORDER BY "createdAt" DESC LIMIT 1`,
    [conta.user.id],
  );

  const vivo = rows[0];

  if (vivo === undefined) {
    return null;
  }

  const esperado = await hashDoCodigo({ appSecret, tokenId: vivo.id, codigo: digitado });

  if (!saoIguais(esperado, vivo.valueHash)) {
    // Errar conta no próprio código: na quinta vez ele morre, e chutar o resto
    // exige pedir outro, que tem limite por e-mail.
    await client.query(
      `UPDATE core."appToken"
       SET "context" = jsonb_set(coalesce("context", '{}'::jsonb), '{tentativas}',
             to_jsonb(coalesce(("context" ->> 'tentativas')::int, 0) + 1)),
           "revokedAt" = CASE
             WHEN coalesce(("context" ->> 'tentativas')::int, 0) + 1 >= $2 THEN now()
             ELSE NULL END,
           "updatedAt" = now()
       WHERE "id" = $1 AND "revokedAt" IS NULL`,
      [vivo.id, TENTATIVAS_POR_CODIGO],
    );

    return null;
  }

  // O UPDATE com "revokedAt" IS NULL é o que garante uso único: se duas
  // requisições chegarem com o mesmo código, só uma volta com linha.
  const gasto = await client.query(
    `UPDATE core."appToken" SET "revokedAt" = now(), "updatedAt" = now()
     WHERE "id" = $1 AND "revokedAt" IS NULL RETURNING "id"`,
    [vivo.id],
  );

  return (gasto.rowCount ?? 0) === 1 ? conta.user.id : null;
};
