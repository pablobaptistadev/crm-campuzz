import { Hono } from 'hono';

import { findActiveSession, findWorkspaceById } from 'src/db/core/auth-repository';
import { resolveWorkspaceFromHost } from 'src/db/core/workspace-resolver';
import { loadWorkspaceMetadata } from 'src/db/core/metadata-repository';
import { withDatabaseClient } from 'src/db/client';
import { hashSessionToken, readSessionToken } from 'src/auth/session';
import { type AppEnv } from 'src/env';
import { buildInsertQuery, buildSoftDeleteQuery, buildUpdateQuery } from 'src/orm/mutations';
import {
  buildCountQuery,
  buildSelectQuery,
  hydrateRecord,
  type OrderByClause,
  type OrderByDirection,
} from 'src/orm/select';
import { buildWorkspaceTableShape } from 'src/orm/table-shape';
import { autorDaSessao, carimbarAutoria } from 'src/services/autoria';
import {
  ehHistorico,
  MENSAGEM_HISTORICO_IMUTAVEL,
} from 'src/services/historico-imutavel';
import {
  canPerform,
  loadWorkspacePermissions,
  type ObjectAction,
} from 'src/services/permissions';
import { type RecordFilter } from 'src/orm/where';

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 1000;

// order_by=field,-other — a leading minus means descending, matching the REST
// convention Twenty's parsers accept.
const parseOrderBy = (value: string | undefined): OrderByClause[] => {
  if (value === undefined || value.length === 0) {
    return [];
  }

  return value.split(',').map((entry) => {
    const isDescending = entry.startsWith('-');
    const fieldName = isDescending ? entry.slice(1) : entry;
    const direction: OrderByDirection = isDescending
      ? 'DescNullsLast'
      : 'AscNullsLast';

    return { fieldName, direction };
  });
};

const parseFilter = (value: string | undefined): RecordFilter | undefined => {
  if (value === undefined || value.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(value) as RecordFilter;
  } catch {
    return undefined;
  }
};

export const restRoute = new Hono<AppEnv>().all('/*', async (context) =>
  withDatabaseClient(context.env, context.executionCtx, async (client) => {
    const sessionToken = readSessionToken(context);

    if (sessionToken === null) {
      return context.json({ error: 'UNAUTHENTICATED' }, 401);
    }

    const session = await findActiveSession({
      client,
      tokenHash: await hashSessionToken(sessionToken),
    });

    if (session === null || session.workspaceId === null) {
      return context.json({ error: 'UNAUTHENTICATED' }, 401);
    }

    const workspaceFromHost = await resolveWorkspaceFromHost({
      client,
      host: context.req.header('X-Forwarded-Host') ?? context.req.header('Host'),
      appDomain: context.env.APP_DOMAIN,
    });

    const workspace =
      workspaceFromHost ??
      (await findWorkspaceById({ client, workspaceId: session.workspaceId }));

    if (workspace === null) {
      return context.json({ error: 'WORKSPACE_NOT_READY' }, 409);
    }

    const metadata = await loadWorkspaceMetadata({
      client,
      workspaceId: workspace.id,
      metadataVersion: workspace.metadataVersion,
    });

    const segments = new URL(context.req.url).pathname
      .split('/')
      .filter((segment) => segment.length > 0)
      .slice(1);

    const [namePlural, recordId] = segments;
    const object = metadata.objects.find(
      (entry) => entry.namePlural === namePlural,
    );

    if (object === undefined) {
      return context.json({ error: `Unknown object: ${namePlural}` }, 404);
    }

    const shape = buildWorkspaceTableShape({
      object,
      workspaceId: metadata.workspaceId,
    });

    // The REST route builds its own SQL rather than going through the GraphQL
    // resolvers, so it needs its own gate — otherwise a role that cannot read
    // an object through /graphql reads it here instead.
    const permissions =
      session.userWorkspaceId === null
        ? null
        : await loadWorkspacePermissions({
            client,
            workspaceId: workspace.id,
            userWorkspaceId: session.userWorkspaceId,
            objectMetadataIds: metadata.objects.map((entry) => entry.id),
          });

    const refuse = (action: ObjectAction) =>
      permissions !== null &&
      !canPerform({ permissions, objectMetadataId: object.id, action })
        ? context.json(
            {
              error: `Not allowed to ${action} records of ${object.nameSingular} with your role`,
            },
            403,
          )
        : null;

    const runQuery = async (query: { text: string; values: unknown[] }) => {
      const { rows } = await client.query(query.text, query.values);

      return rows.map((row) =>
        hydrateRecord({ shape, alias: shape.nameSingular, row }),
      );
    };

    if (context.req.method === 'GET') {
      const refused = refuse('read');

      if (refused !== null) {
        return refused;
      }

      const url = new URL(context.req.url);
      const limit = Math.min(
        Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT) || DEFAULT_LIMIT,
        MAX_LIMIT,
      );

      const filter =
        recordId === undefined
          ? parseFilter(url.searchParams.get('filter') ?? undefined)
          : { id: { eq: recordId } };

      const records = await runQuery(
        buildSelectQuery({
          shape,
          filter,
          orderBy: parseOrderBy(url.searchParams.get('order_by') ?? undefined),
          limit: recordId === undefined ? limit : 1,
        }),
      );

      if (recordId !== undefined) {
        return records[0] === undefined
          ? context.json({ error: 'Not found' }, 404)
          : context.json({ data: { [object.nameSingular]: records[0] } });
      }

      const countQuery = buildCountQuery({ shape, filter });
      const { rows } = await client.query(countQuery.text, countQuery.values);

      // Flat shape, not Relay: the REST API mirrors Twenty's own response body.
      return context.json({
        data: { [object.namePlural]: records },
        totalCount: Number(rows[0]?.count ?? 0),
      });
    }

    if (context.req.method === 'POST') {
      const refused = refuse('update');

      if (refused !== null) {
        return refused;
      }

      const body = (await context.req.json()) as Record<string, unknown>;

      // Mesmo carimbo do GraphQL: sem ele, quem monta o corpo escolhia em nome
      // de quem a linha nascia.
      const autor = await autorDaSessao({
        client,
        workspaceId: metadata.workspaceId,
        userId: session.userId,
      });
      const records = await runQuery(
        buildInsertQuery({
          shape,
          input: carimbarAutoria({
            shape,
            nomeDoObjeto: object.nameSingular,
            dados: body,
            autor,
            origem: 'MANUAL',
          }),
        }),
      );

      return context.json({ data: { [object.nameSingular]: records[0] } }, 201);
    }

    // O histórico só acrescenta, para todo papel — ver historico-imutavel.
    if (
      (context.req.method === 'PATCH' || context.req.method === 'DELETE') &&
      ehHistorico(object.nameSingular)
    ) {
      return context.json(
        { error: 'FORBIDDEN', message: MENSAGEM_HISTORICO_IMUTAVEL },
        403,
      );
    }

    if (context.req.method === 'PATCH' && recordId !== undefined) {
      const refused = refuse('update');

      if (refused !== null) {
        return refused;
      }

      const body = (await context.req.json()) as Record<string, unknown>;
      const records = await runQuery(
        buildUpdateQuery({ shape, id: recordId, input: body }),
      );

      return records[0] === undefined
        ? context.json({ error: 'Not found' }, 404)
        : context.json({ data: { [object.nameSingular]: records[0] } });
    }

    if (context.req.method === 'DELETE' && recordId !== undefined) {
      const refused = refuse('softDelete');

      if (refused !== null) {
        return refused;
      }

      const records = await runQuery(buildSoftDeleteQuery({ shape, id: recordId }));

      return records[0] === undefined
        ? context.json({ error: 'Not found' }, 404)
        : context.json({ data: { [object.nameSingular]: records[0] } });
    }

    return context.json({ error: 'Method not allowed' }, 405);
  }),
);
