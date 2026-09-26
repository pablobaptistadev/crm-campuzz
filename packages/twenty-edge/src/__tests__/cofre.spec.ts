import { describe, expect, it } from 'vitest';

import { type Client } from 'pg';

import { cofreEmPostgres } from 'src/financeiro/infra/cofre';
import { deduplicacaoEmPostgres } from 'src/financeiro/infra/deduplicacao';
import { registroDeWebhookEmPostgres } from 'src/financeiro/infra/registro-de-webhook';

const WORKSPACE = 'e3332ba1-91f3-4d90-ac84-e8ee8d2595a9';
const OUTRO_WORKSPACE = '11111111-1111-4111-8111-111111111111';
const BU = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const APP_SECRET = 'segredo-de-teste-que-nao-e-o-de-producao';

// Um Postgres de mentira que guarda linha em memória e entende só o punhado de
// consultas que estes adaptadores emitem. Basta porque o que está sob teste é o
// que entra e sai da coluna, não o planejador do Postgres.
const bancoDeMentira = () => {
  const credenciais = new Map<string, { workspaceId: string; cifra: string }>();
  const eventos = new Set<string>();
  const reivindicacoes = new Map<
    string,
    { workspaceId: string; businessUnitId: string }
  >();

  const query = async (text: string, values: unknown[] = []) => {
    if (text.includes('core."gatewayCredential"')) {
      if (text.startsWith('SELECT')) {
        const guardada = credenciais.get(values[0] as string);

        return {
          rows:
            guardada !== undefined && guardada.workspaceId === values[1]
              ? [{ cifra: guardada.cifra }]
              : [],
        };
      }

      if (text.startsWith('INSERT')) {
        credenciais.set(values[0] as string, {
          workspaceId: values[1] as string,
          cifra: values[2] as string,
        });

        return { rows: [] };
      }

      credenciais.delete(values[0] as string);

      return { rows: [] };
    }

    if (text.includes('core."gatewayEvent"')) {
      const chave = `${values[0] as string}:${values[1] as string}`;

      if (text.startsWith('SELECT')) {
        return { rows: eventos.has(chave) ? [{ '?column?': 1 }] : [] };
      }

      eventos.add(chave);

      return { rows: [] };
    }

    if (text.includes('core."gatewayWebhookClaim"')) {
      if (text.startsWith('SELECT')) {
        const achada = reivindicacoes.get(values[0] as string);

        return { rows: achada === undefined ? [] : [achada] };
      }

      if (text.startsWith('INSERT')) {
        reivindicacoes.set(values[0] as string, {
          workspaceId: values[1] as string,
          businessUnitId: values[2] as string,
        });

        return { rows: [] };
      }

      reivindicacoes.delete(values[0] as string);

      return { rows: [] };
    }

    throw new Error(`consulta não prevista no teste: ${text}`);
  };

  return { query } as unknown as Client;
};

describe('cofre de credenciais', () => {
  it('devolve a mesma chave que guardou', async () => {
    const cofre = cofreEmPostgres({
      client: bancoDeMentira(),
      workspaceId: WORKSPACE,
      appSecret: APP_SECRET,
    });

    await cofre.write(BU, { apiKey: 'pk_vivo_123', secretKey: 'sk_vivo_456' });

    expect(await cofre.read(BU)).toEqual({
      apiKey: 'pk_vivo_123',
      secretKey: 'sk_vivo_456',
    });
  });

  it('não guarda a chave em claro na coluna', async () => {
    const client = bancoDeMentira();
    const cofre = cofreEmPostgres({
      client,
      workspaceId: WORKSPACE,
      appSecret: APP_SECRET,
    });

    await cofre.write(BU, { apiKey: 'pk_vivo_123', secretKey: 'sk_vivo_456' });

    const { rows } = await client.query(
      `SELECT "cifra" FROM core."gatewayCredential"
       WHERE "businessUnitId" = $1 AND "workspaceId" = $2`,
      [BU, WORKSPACE],
    );

    expect(rows[0].cifra).not.toContain('pk_vivo_123');
    expect(rows[0].cifra).not.toContain('sk_vivo_456');
  });

  // Duas escritas iguais têm de dar cifras diferentes: nonce repetido em AES-GCM
  // não é só vazar igualdade, é perder a garantia do modo.
  it('cifra a mesma chave duas vezes com resultados diferentes', async () => {
    const client = bancoDeMentira();
    const cofre = cofreEmPostgres({
      client,
      workspaceId: WORKSPACE,
      appSecret: APP_SECRET,
    });

    const credencial = { apiKey: 'pk_igual', secretKey: 'sk_igual' };

    await cofre.write(BU, credencial);
    const primeira = (await client.query(
      `SELECT "cifra" FROM core."gatewayCredential"
       WHERE "businessUnitId" = $1 AND "workspaceId" = $2`,
      [BU, WORKSPACE],
    )) as unknown as { rows: { cifra: string }[] };

    await cofre.write(BU, credencial);
    const segunda = (await client.query(
      `SELECT "cifra" FROM core."gatewayCredential"
       WHERE "businessUnitId" = $1 AND "workspaceId" = $2`,
      [BU, WORKSPACE],
    )) as unknown as { rows: { cifra: string }[] };

    expect(primeira.rows[0].cifra).not.toBe(segunda.rows[0].cifra);
  });

  it('não entrega a chave de um workspace para outro', async () => {
    const client = bancoDeMentira();

    await cofreEmPostgres({
      client,
      workspaceId: WORKSPACE,
      appSecret: APP_SECRET,
    }).write(BU, { apiKey: 'pk_vivo_123', secretKey: 'sk_vivo_456' });

    const intruso = cofreEmPostgres({
      client,
      workspaceId: OUTRO_WORKSPACE,
      appSecret: APP_SECRET,
    });

    expect(await intruso.read(BU)).toBeNull();
  });

  it('recusa abrir a cifra com outro APP_SECRET', async () => {
    const client = bancoDeMentira();

    await cofreEmPostgres({
      client,
      workspaceId: WORKSPACE,
      appSecret: APP_SECRET,
    }).write(BU, { apiKey: 'pk_vivo_123', secretKey: 'sk_vivo_456' });

    const comOutroSegredo = cofreEmPostgres({
      client,
      workspaceId: WORKSPACE,
      appSecret: 'outro-segredo-qualquer',
    });

    await expect(comOutroSegredo.read(BU)).rejects.toThrow();
  });

  it('devolve nulo quando não há nada guardado', async () => {
    const cofre = cofreEmPostgres({
      client: bancoDeMentira(),
      workspaceId: WORKSPACE,
      appSecret: APP_SECRET,
    });

    expect(await cofre.read(BU)).toBeNull();
  });
});

describe('deduplicação de evento', () => {
  it('reconhece o evento já aplicado e ignora o de outro workspace', async () => {
    const client = bancoDeMentira();
    const daqui = deduplicacaoEmPostgres({ client, workspaceId: WORKSPACE });
    const dali = deduplicacaoEmPostgres({
      client,
      workspaceId: OUTRO_WORKSPACE,
    });

    expect(await daqui.hasBeenApplied('evt_1')).toBe(false);

    await daqui.markAsApplied('evt_1');

    expect(await daqui.hasBeenApplied('evt_1')).toBe(true);
    expect(await dali.hasBeenApplied('evt_1')).toBe(false);
  });

  it('marcar duas vezes não estoura', async () => {
    const dedup = deduplicacaoEmPostgres({
      client: bancoDeMentira(),
      workspaceId: WORKSPACE,
    });

    await dedup.markAsApplied('evt_2');

    await expect(dedup.markAsApplied('evt_2')).resolves.toBeUndefined();
  });
});

describe('registro de webhook', () => {
  const REGISTRO = '3f1b8c2e-9a4d-4c7f-8b2a-5e6d7c8f9a0b';

  it('resolve a reivindicação que gravou e some depois de liberar', async () => {
    const registro = registroDeWebhookEmPostgres({ client: bancoDeMentira() });

    await registro.claim(REGISTRO, {
      workspaceId: WORKSPACE,
      businessUnitId: BU,
    });

    expect(await registro.resolve(REGISTRO)).toEqual({
      workspaceId: WORKSPACE,
      businessUnitId: BU,
    });

    await registro.release(REGISTRO);

    expect(await registro.resolve(REGISTRO)).toBeNull();
  });

  // Sem a guarda, isto viraria erro de cast no Postgres e a rota responderia
  // 500, contando a quem sondou que o caminho existe.
  it('trata registrationId que não é UUID como inexistente, sem ir ao banco', async () => {
    const registro = registroDeWebhookEmPostgres({
      client: {
        query: () => {
          throw new Error('não deveria consultar o banco');
        },
      } as unknown as Client,
    });

    expect(await registro.resolve("'; DROP TABLE core.workspace; --")).toBeNull();
    await expect(registro.release('nao-e-uuid')).resolves.toBeUndefined();
  });
});
