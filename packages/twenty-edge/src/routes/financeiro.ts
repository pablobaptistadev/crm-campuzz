import { type Context, Hono } from 'hono';
import { type Client } from 'pg';

import { hashSessionToken, readSessionToken } from 'src/auth/session';
import { withDatabaseClient } from 'src/db/client';
import { findSessionContext } from 'src/db/core/auth-repository';
import { loadWorkspaceMetadata } from 'src/db/core/metadata-repository';
import { resolveWorkspaceFromHost } from 'src/db/core/workspace-resolver';
import { type AppEnv } from 'src/env';
import { type ContractHolder } from 'src/financeiro/core/domain/entities/gateway-contract.entity';
import { FinanceiroError } from 'src/financeiro/core/domain/errors/financeiro.error';
import { cofreEmPostgres } from 'src/financeiro/infra/cofre';
import { comoErroDeNegocio } from 'src/financeiro/infra/erro-do-gateway';
import { garantirTabelasDoFinanceiro } from 'src/financeiro/infra/ddl';
import { diretorioDoCrmEmPostgres } from 'src/financeiro/infra/diretorio-do-crm';
import { registroDeWebhookEmPostgres } from 'src/financeiro/infra/registro-de-webhook';
import { repositorioDeBuEmPostgres } from 'src/financeiro/infra/repositorio-de-bu';
import { repositorioDeContratoEmPostgres } from 'src/financeiro/infra/repositorio-de-contrato';
import { repositorioDeFaturaEmPostgres } from 'src/financeiro/infra/repositorio-de-fatura';
import { identificadorDoSistema, relogioDoSistema } from 'src/financeiro/infra/sistema';
import { RouterfyGateway } from 'src/financeiro/gateways/routerfy/routerfy.gateway';
import { previewContract } from 'src/financeiro/core/use-cases/preview-contract.use-case';
import { resolveBusinessUnit } from 'src/financeiro/core/use-cases/resolve-business-unit.use-case';
import { attachContract } from 'src/financeiro/core/use-cases/attach-contract.use-case';
import { saveBusinessUnit } from 'src/financeiro/core/use-cases/save-business-unit.use-case';
import { type WorkspaceMetadata } from 'src/metadata/types';

// CREATE TABLE IF NOT EXISTS é barato, mas não de graça: uma vez por isolate
// basta, e o isolate morre sozinho. Isso troca uma etapa de migração manual —
// que é justamente o passo que costuma faltar num deploy — por um custo que
// desaparece na segunda requisição.
let tabelasGarantidas = false;

const garantirTabelas = async (client: Client) => {
  if (tabelasGarantidas) {
    return;
  }

  await garantirTabelasDoFinanceiro(client);
  tabelasGarantidas = true;
};

type Sessao = {
  client: Client;
  metadata: WorkspaceMetadata;
  workspaceId: string;
  origem: string;
};

const impressaoDigital = async (apiKey: string): Promise<string> => {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(apiKey),
  );

  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
};

const montarDependencias = (sessao: Sessao, appSecret: string) => {
  const comMetadata = { client: sessao.client, metadata: sessao.metadata };

  // Getters, e não um objeto pronto: cada repositório resolve tabela e coluna no
  // metadata ao nascer, então montar todos de uma vez faz um repositório
  // quebrado derrubar rotas que nem o usam. Foi assim que um nome de campo
  // errado nas faturas tirou o GET /bus do ar.
  return {
    get businessUnits() {
      return repositorioDeBuEmPostgres(comMetadata);
    },
    get contracts() {
      return repositorioDeContratoEmPostgres(comMetadata);
    },
    get invoices() {
      return repositorioDeFaturaEmPostgres(comMetadata);
    },
    get directory() {
      return diretorioDoCrmEmPostgres(comMetadata);
    },
    get vault() {
      return cofreEmPostgres({
        client: sessao.client,
        workspaceId: sessao.workspaceId,
        appSecret,
      });
    },
    get webhooks() {
      return registroDeWebhookEmPostgres({ client: sessao.client });
    },
    clock: relogioDoSistema,
    identifiers: identificadorDoSistema,
  };
};

const donoDoCorpo = (corpo: {
  clubeId?: string;
  membroId?: string;
}): ContractHolder | null => {
  if (typeof corpo.membroId === 'string' && corpo.membroId.length > 0) {
    return { type: 'PERSON', recordId: corpo.membroId };
  }

  if (typeof corpo.clubeId === 'string' && corpo.clubeId.length > 0) {
    return { type: 'COMPANY', recordId: corpo.clubeId };
  }

  return null;
};

const comSessao = async <T>(
  context: Context<AppEnv>,
  executar: (sessao: Sessao) => Promise<T>,
) =>
  withDatabaseClient(context.env, context.executionCtx, async (client) => {
    const sessionToken = readSessionToken(context);

    if (sessionToken === null) {
      return context.json({ error: 'UNAUTHENTICATED' }, 401);
    }

    const sessionContext = await findSessionContext({
      client,
      tokenHash: await hashSessionToken(sessionToken),
    });

    if (sessionContext === null || sessionContext.membership === null) {
      return context.json({ error: 'UNAUTHENTICATED' }, 401);
    }

    const workspaceFromHost = await resolveWorkspaceFromHost({
      client,
      host: context.req.header('X-Forwarded-Host') ?? context.req.header('Host'),
      appDomain: context.env.APP_DOMAIN,
    });

    const workspace = workspaceFromHost ?? sessionContext.membership.workspace;

    if (workspace === null || workspace.databaseSchema === null) {
      return context.json({ error: 'WORKSPACE_NOT_READY' }, 409);
    }

    await garantirTabelas(client);

    const metadata = await loadWorkspaceMetadata({
      client,
      workspaceId: workspace.id,
      metadataVersion: workspace.metadataVersion,
    });

    try {
      return context.json(
        (await executar({
          client,
          metadata,
          workspaceId: workspace.id,
          origem: new URL(context.req.url).origin,
        })) as Record<string, unknown>,
      );
    } catch (erro) {
      // Erro do domínio já vem escrito para quem está na tela; o resto vira
      // mensagem genérica, porque detalhe de banco na tela não ajuda ninguém e
      // conta demais a quem não deveria.
      if (erro instanceof FinanceiroError) {
        return context.json({ error: erro.code, message: erro.message }, 400);
      }

      throw erro;
    }
  });

export const financeiroRoute = new Hono<AppEnv>()
  .get('/bus', (context) =>
    comSessao(context, async (sessao) => ({
      bus: await montarDependencias(
        sessao,
        context.env.APP_SECRET ?? '',
      ).businessUnits.listAll(),
    })),
  )

  .post('/bus', (context) =>
    comSessao(context, async (sessao) => {
      const corpo = await context.req.json<{
        businessUnitId?: string;
        name?: string;
        apiKey?: string;
        secretKey?: string;
        isDefault?: boolean;
        financeEmail?: string;
      }>();

      const dependencias = montarDependencias(
        sessao,
        context.env.APP_SECRET ?? '',
      );

      const apiKey = corpo.apiKey ?? '';
      const impressao = await impressaoDigital(apiKey);
      const jaExistem = await dependencias.businessUnits.listAll();
      const ehAPrimeira = jaExistem.length === 0;

      try {
        const bu = await saveBusinessUnit(
        {
          ...dependencias,
          gateway: new RouterfyGateway(),
          workspaceId: sessao.workspaceId,
          buildWebhookUrl: (registrationId) =>
            `${sessao.origem}/webhooks/gateway/${registrationId}`,
          fingerprint: () => impressao,
        },
        {
          businessUnitId: corpo.businessUnitId,
          name: corpo.name ?? '',
          credential: { apiKey, secretKey: corpo.secretKey ?? '' },
          isDefault: corpo.isDefault === true || ehAPrimeira,
          financeEmail: corpo.financeEmail ?? null,
        },
      );

        return { bu };
      } catch (causa) {
        throw comoErroDeNegocio(causa, '');
      }
    }),
  )

  .post('/contrato/preview', (context) =>
    comSessao(context, async (sessao) => {
      const corpo = await context.req.json<{
        clubeId?: string;
        membroId?: string;
        businessUnitId?: string;
        identifier?: string;
      }>();

      const holder = donoDoCorpo(corpo);

      if (holder === null) {
        throw new FinanceiroError('INVALID_INPUT', 'Informe o clube ou o membro.');
      }

      const dependencias = montarDependencias(
        sessao,
        context.env.APP_SECRET ?? '',
      );

      // Sem BU escolhida, a cascata decide: a do próprio registro, a do clube do
      // membro, e por fim a padrão. É o que faz "1 key pra todos" não exigir
      // configuração nenhuma.
      const businessUnitId =
        corpo.businessUnitId ??
        (await resolveBusinessUnit(dependencias, holder)).id;

      const identifier = corpo.identifier ?? '';

      try {
        return await previewContract(
          { ...dependencias, gateway: new RouterfyGateway() },
          { holder, businessUnitId, identifier },
        );
      } catch (causa) {
        throw comoErroDeNegocio(causa, identifier);
      }
    }),
  )
  .post('/contrato/vincular', (context) =>
    comSessao(context, async (sessao) => {
      const corpo = await context.req.json<{
        clubeId?: string;
        membroId?: string;
        businessUnitId?: string;
        identifier?: string;
        permitirEmailDiferente?: boolean;
      }>();

      const holder = donoDoCorpo(corpo);

      if (holder === null) {
        throw new FinanceiroError('INVALID_INPUT', 'Informe o clube ou o membro.');
      }

      const dependencias = montarDependencias(
        sessao,
        context.env.APP_SECRET ?? '',
      );

      const businessUnitId =
        corpo.businessUnitId ??
        (await resolveBusinessUnit(dependencias, holder)).id;

      await sessao.client.query('BEGIN');

      try {
        const resultado = await attachContract(
          { ...dependencias, gateway: new RouterfyGateway() },
          {
            holder,
            businessUnitId,
            identifier: corpo.identifier ?? '',
            permitirEmailDiferente: corpo.permitirEmailDiferente === true,
          },
        );

        await sessao.client.query('COMMIT');

        return resultado;
      } catch (causa) {
        await sessao.client.query('ROLLBACK').catch(() => undefined);

        throw comoErroDeNegocio(causa, corpo.identifier ?? '');
      }
    }),
  )
  // Trocar o financeiro não passa por saveBusinessUnit de propósito: aquele
  // valida credencial e reinstala o webhook, e quem só quer corrigir um e-mail
  // não tem as chaves em mãos — elas estão no cofre e nunca voltam para a tela.
  .post('/bus/financeiro', (context) =>
    comSessao(context, async (sessao) => {
      const corpo = await context.req.json<{
        businessUnitId?: string;
        financeEmail?: string | null;
      }>();

      const dependencias = montarDependencias(
        sessao,
        context.env.APP_SECRET ?? '',
      );

      const atual =
        corpo.businessUnitId === undefined
          ? null
          : await dependencias.businessUnits.findById(corpo.businessUnitId);

      if (atual === null) {
        throw new FinanceiroError('INVALID_INPUT', 'Escolha uma BU existente.');
      }

      const email = (corpo.financeEmail ?? '').trim();

      if (email !== '' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        throw new FinanceiroError('INVALID_INPUT', 'E-mail inválido.');
      }

      return {
        bu: await dependencias.businessUnits.save({
          ...atual,
          financeEmail: email === '' ? null : email,
        }),
      };
    }),
  );
