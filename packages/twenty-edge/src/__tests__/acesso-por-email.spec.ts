import { type Client } from 'pg';
import { describe, expect, it } from 'vitest';

import { verifyPassword } from 'src/auth/password';
import {
  ErroDeAcesso,
  TENTATIVAS_POR_CODIGO,
  conferirCodigoDeAcesso,
  gerarCodigo,
  lerRedefinicaoDeSenha,
  linkParaRedefinirSenha,
  prepararCodigoDeAcesso,
  prepararRedefinicaoDeSenha,
  redefinirSenha,
} from 'src/services/acesso-por-email';

const APP_SECRET = 'segredo-de-teste';
const EMAIL = 'carol@exemplo.com.br';

type Token = {
  id: string;
  userId: string;
  type: string;
  valueHash: string;
  tentativas: number;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: number;
};

// Um banco de mentira com só o que estes fluxos tocam: a conta, o workspace,
// os tokens e as sessões. Cada SQL é reconhecido por um trecho dele.
const bancoFalso = ({ desativada = false }: { desativada?: boolean } = {}) => {
  const usuario = {
    id: 'u1',
    firstName: 'Carol',
    lastName: null,
    email: EMAIL,
    isEmailVerified: true,
    passwordHash: null as string | null,
    disabled: desativada,
    locale: 'pt-BR',
  };
  const tokens: Token[] = [];
  const sessoes = [{ userId: 'u1', revokedAt: null as Date | null, revokedReason: null as string | null }];
  let relogio = 0;

  const vivos = () => tokens.filter((token) => token.revokedAt === null && token.expiresAt.getTime() > Date.now());

  const query = async (sqlCru: string, valores: unknown[] = []) => {
    const sql = sqlCru.replace(/\s+/g, ' ').trim();

    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) {
      return { rows: [], rowCount: 0 };
    }

    if (sql.includes('FROM core."user" WHERE "email" = $1')) {
      return { rows: valores[0] === usuario.email ? [usuario] : [], rowCount: 1 };
    }

    if (sql.includes('FROM core."userWorkspace"')) {
      return { rows: [{ id: 'w1', displayName: 'Clube', userWorkspaceId: 'uw1' }], rowCount: 1 };
    }

    if (sql.startsWith('INSERT INTO core."appToken"')) {
      const comId = sql.includes('("id",');
      const [id, , userId, valueHash, , expiresAt] = comId
        ? valores
        : [`t${tokens.length + 1}`, ...valores];
      const tipo = sql.includes("'LOGIN_CODE'") ? 'LOGIN_CODE' : 'PASSWORD_RESET';

      tokens.push({
        id: id as string,
        userId: userId as string,
        type: tipo,
        valueHash: valueHash as string,
        tentativas: 0,
        expiresAt: expiresAt as Date,
        revokedAt: null,
        createdAt: relogio++,
      });

      return { rows: [], rowCount: 1 };
    }

    if (sql.startsWith('SELECT t."userId"')) {
      const token = vivos().find((item) => item.type === 'PASSWORD_RESET' && item.valueHash === valores[0]);

      return {
        rows: token === undefined || usuario.disabled
          ? []
          : [{ userId: token.userId, email: usuario.email, hasPassword: usuario.passwordHash !== null }],
        rowCount: 1,
      };
    }

    if (sql.startsWith('SELECT "id","valueHash" FROM core."appToken"')) {
      const ultimo = vivos()
        .filter((item) => item.type === 'LOGIN_CODE' && item.userId === valores[0])
        .sort((a, b) => b.createdAt - a.createdAt)[0];

      return { rows: ultimo === undefined ? [] : [ultimo], rowCount: 1 };
    }

    if (sql.startsWith('UPDATE core."appToken" SET "context" = jsonb_set')) {
      const token = tokens.find((item) => item.id === valores[0] && item.revokedAt === null);

      if (token !== undefined) {
        token.tentativas += 1;
        token.revokedAt = token.tentativas >= (valores[1] as number) ? new Date() : null;
      }

      return { rows: [], rowCount: token === undefined ? 0 : 1 };
    }

    if (sql.startsWith('UPDATE core."appToken"') && sql.includes('WHERE "valueHash" = $1')) {
      const token = vivos().find((item) => item.type === 'PASSWORD_RESET' && item.valueHash === valores[0]);

      if (token !== undefined) {
        token.revokedAt = new Date();
      }

      return { rows: token === undefined ? [] : [{ userId: token.userId }], rowCount: token === undefined ? 0 : 1 };
    }

    if (sql.startsWith('UPDATE core."appToken"') && sql.includes('WHERE "id" = $1')) {
      const token = tokens.find((item) => item.id === valores[0] && item.revokedAt === null);

      if (token !== undefined) {
        token.revokedAt = new Date();
      }

      return { rows: token === undefined ? [] : [{ id: token.id }], rowCount: token === undefined ? 0 : 1 };
    }

    if (sql.startsWith('UPDATE core."appToken"') && sql.includes('WHERE "userId" = $1')) {
      const tipos = sql.includes("IN ('PASSWORD_RESET','LOGIN_CODE')")
        ? ['PASSWORD_RESET', 'LOGIN_CODE']
        : [sql.includes("'LOGIN_CODE'") ? 'LOGIN_CODE' : 'PASSWORD_RESET'];
      const alvo = tokens.filter(
        (item) => item.userId === valores[0] && tipos.includes(item.type) && item.revokedAt === null,
      );

      alvo.forEach((item) => {
        item.revokedAt = new Date();
      });

      return { rows: [], rowCount: alvo.length };
    }

    if (sql.startsWith('UPDATE core."user" SET "passwordHash"')) {
      if (usuario.disabled) {
        return { rows: [], rowCount: 0 };
      }

      usuario.passwordHash = valores[1] as string;

      return { rows: [], rowCount: 1 };
    }

    if (sql.startsWith('UPDATE core."userSession"')) {
      const abertas = sessoes.filter((sessao) => sessao.revokedAt === null);

      abertas.forEach((sessao) => {
        sessao.revokedAt = new Date();
        sessao.revokedReason = 'PASSWORD_RESET';
      });

      return { rows: [], rowCount: abertas.length };
    }

    throw new Error(`SQL não previsto no teste: ${sql}`);
  };

  return { client: { query } as unknown as Client, usuario, tokens, sessoes };
};

const codigoDoEmail = (assunto: string) => assunto.slice(0, 6);
const tokenDoLink = (texto: string) => /token=([0-9a-f]+)/.exec(texto)?.[1] ?? '';

describe('código de acesso por e-mail', () => {
  it('o código do e-mail entra uma vez, e só uma', async () => {
    const banco = bancoFalso();
    const email = await prepararCodigoDeAcesso({ client: banco.client, appSecret: APP_SECRET, email: EMAIL });

    expect(email?.to).toBe(EMAIL);
    const codigo = codigoDoEmail(email?.subject ?? '');

    expect(codigo).toMatch(/^\d{6}$/);
    expect(email?.text).toContain(codigo);
    // No banco fica só o HMAC, nunca o número.
    expect(banco.tokens[0]?.valueHash).not.toContain(codigo);

    const entrada = { client: banco.client, appSecret: APP_SECRET, email: EMAIL, codigo };

    expect(await conferirCodigoDeAcesso(entrada)).toBe('u1');
    expect(await conferirCodigoDeAcesso(entrada)).toBeNull();
  });

  it('aceita o código digitado com espaço no meio', async () => {
    const banco = bancoFalso();
    const email = await prepararCodigoDeAcesso({ client: banco.client, appSecret: APP_SECRET, email: EMAIL });
    const codigo = codigoDoEmail(email?.subject ?? '');

    expect(
      await conferirCodigoDeAcesso({
        client: banco.client,
        appSecret: APP_SECRET,
        email: EMAIL,
        codigo: `${codigo.slice(0, 3)} ${codigo.slice(3)}`,
      }),
    ).toBe('u1');
  });

  it(`depois de ${TENTATIVAS_POR_CODIGO} erros o código morre, mesmo o certo`, async () => {
    const banco = bancoFalso();
    const email = await prepararCodigoDeAcesso({ client: banco.client, appSecret: APP_SECRET, email: EMAIL });
    const codigo = codigoDoEmail(email?.subject ?? '');
    const errado = codigo === '000000' ? '111111' : '000000';

    for (let tentativa = 0; tentativa < TENTATIVAS_POR_CODIGO; tentativa++) {
      expect(
        await conferirCodigoDeAcesso({ client: banco.client, appSecret: APP_SECRET, email: EMAIL, codigo: errado }),
      ).toBeNull();
    }

    expect(
      await conferirCodigoDeAcesso({ client: banco.client, appSecret: APP_SECRET, email: EMAIL, codigo }),
    ).toBeNull();
  });

  it('pedir outro código invalida o anterior', async () => {
    const banco = bancoFalso();
    const primeiro = await prepararCodigoDeAcesso({ client: banco.client, appSecret: APP_SECRET, email: EMAIL });
    const segundo = await prepararCodigoDeAcesso({ client: banco.client, appSecret: APP_SECRET, email: EMAIL });
    const antigo = codigoDoEmail(primeiro?.subject ?? '');
    const novo = codigoDoEmail(segundo?.subject ?? '');

    if (antigo !== novo) {
      expect(
        await conferirCodigoDeAcesso({ client: banco.client, appSecret: APP_SECRET, email: EMAIL, codigo: antigo }),
      ).toBeNull();
    }

    expect(
      await conferirCodigoDeAcesso({ client: banco.client, appSecret: APP_SECRET, email: EMAIL, codigo: novo }),
    ).toBe('u1');
  });

  it('o código vale para o APP_SECRET que o emitiu e não para outro', async () => {
    const banco = bancoFalso();
    const email = await prepararCodigoDeAcesso({ client: banco.client, appSecret: APP_SECRET, email: EMAIL });

    expect(
      await conferirCodigoDeAcesso({
        client: banco.client,
        appSecret: 'outro-segredo',
        email: EMAIL,
        codigo: codigoDoEmail(email?.subject ?? ''),
      }),
    ).toBeNull();
  });

  it('e-mail sem conta e conta desativada não recebem nada', async () => {
    const semConta = bancoFalso();

    expect(
      await prepararCodigoDeAcesso({ client: semConta.client, appSecret: APP_SECRET, email: 'ninguem@exemplo.com.br' }),
    ).toBeNull();

    const desativada = bancoFalso({ desativada: true });

    expect(await prepararCodigoDeAcesso({ client: desativada.client, appSecret: APP_SECRET, email: EMAIL })).toBeNull();
    expect(desativada.tokens).toHaveLength(0);
  });

  it('sorteia sempre 6 dígitos', () => {
    for (let vez = 0; vez < 200; vez++) {
      expect(gerarCodigo()).toMatch(/^\d{6}$/);
    }
  });
});

describe('redefinir a senha por e-mail', () => {
  it('o link do e-mail troca a senha, derruba as sessões e não serve de novo', async () => {
    const banco = bancoFalso();
    const email = await prepararRedefinicaoDeSenha({
      client: banco.client,
      email: EMAIL,
      serverUrl: 'https://clubes.campuzz.com.br',
    });
    const token = tokenDoLink(email?.text ?? '');

    expect(email?.text).toContain('https://clubes.campuzz.com.br/redefinir-senha?token=');
    expect(await lerRedefinicaoDeSenha({ client: banco.client, token })).toEqual({
      userId: 'u1',
      email: EMAIL,
      hasPassword: false,
    });

    const resultado = await redefinirSenha({ client: banco.client, token, novaSenha: 'senha-nova-123' });

    expect(resultado.sessoesEncerradas).toBe(1);
    expect(await verifyPassword('senha-nova-123', banco.usuario.passwordHash ?? '')).toBe(true);
    expect(await lerRedefinicaoDeSenha({ client: banco.client, token })).toBeNull();
    await expect(
      redefinirSenha({ client: banco.client, token, novaSenha: 'outra-senha-456' }),
    ).rejects.toBeInstanceOf(ErroDeAcesso);
  });

  it('pedir outro link invalida o anterior', async () => {
    const banco = bancoFalso();
    const primeiro = await prepararRedefinicaoDeSenha({ client: banco.client, email: EMAIL, serverUrl: 'https://clubes.campuzz.com.br' });
    await prepararRedefinicaoDeSenha({ client: banco.client, email: EMAIL, serverUrl: 'https://clubes.campuzz.com.br' });

    expect(await lerRedefinicaoDeSenha({ client: banco.client, token: tokenDoLink(primeiro?.text ?? '') })).toBeNull();
  });

  it('senha curta é recusada antes de gastar o link', async () => {
    const banco = bancoFalso();
    const email = await prepararRedefinicaoDeSenha({ client: banco.client, email: EMAIL, serverUrl: 'https://clubes.campuzz.com.br' });
    const token = tokenDoLink(email?.text ?? '');

    await expect(redefinirSenha({ client: banco.client, token, novaSenha: 'curta' })).rejects.toBeInstanceOf(ErroDeAcesso);
    expect(await lerRedefinicaoDeSenha({ client: banco.client, token })).not.toBeNull();
  });

  it('usar o link encerra também um código de acesso que estava vivo', async () => {
    const banco = bancoFalso();
    const codigo = await prepararCodigoDeAcesso({ client: banco.client, appSecret: APP_SECRET, email: EMAIL });
    const email = await prepararRedefinicaoDeSenha({ client: banco.client, email: EMAIL, serverUrl: 'https://clubes.campuzz.com.br' });

    await redefinirSenha({ client: banco.client, token: tokenDoLink(email?.text ?? ''), novaSenha: 'senha-nova-123' });

    expect(
      await conferirCodigoDeAcesso({
        client: banco.client,
        appSecret: APP_SECRET,
        email: EMAIL,
        codigo: codigoDoEmail(codigo?.subject ?? ''),
      }),
    ).toBeNull();
  });

  it('e-mail sem conta não gera link', async () => {
    const banco = bancoFalso();

    expect(
      await prepararRedefinicaoDeSenha({ client: banco.client, email: 'ninguem@exemplo.com.br', serverUrl: 'https://clubes.campuzz.com.br' }),
    ).toBeNull();
    expect(banco.tokens).toHaveLength(0);
  });

  it('o link volta para o app de onde a pessoa pediu', () => {
    expect(linkParaRedefinirSenha('https://clubes.campuzz.com.br', 'abc')).toBe(
      'https://clubes.campuzz.com.br/redefinir-senha?token=abc',
    );
    expect(linkParaRedefinirSenha('https://crm.campuzz.com.br', 'abc')).toBe(
      'https://crm.campuzz.com.br/reset-password/abc',
    );
  });
});
