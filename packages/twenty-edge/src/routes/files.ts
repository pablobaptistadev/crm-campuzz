import { type Context, Hono } from 'hono';

import { findActiveSession } from 'src/db/core/auth-repository';
import { withDatabaseClient } from 'src/db/client';
import { hashSessionToken, readSessionToken } from 'src/auth/session';
import { type AppEnv } from 'src/env';

const requireWorkspaceId = async (
  context: Context<AppEnv>,
): Promise<string | null> =>
  withDatabaseClient(context.env, context.executionCtx, async (client) => {
    const sessionToken = readSessionToken(context);

    if (sessionToken === null) {
      return null;
    }

    const session = await findActiveSession({
      client,
      tokenHash: await hashSessionToken(sessionToken),
    });

    return session?.workspaceId ?? null;
  });

// Files are namespaced per workspace so one tenant can never address another's
// objects by guessing a key.
const buildObjectKey = ({
  workspaceId,
  folder,
  fileId,
}: {
  workspaceId: string;
  folder: string;
  fileId: string;
}): string => `${workspaceId}/${folder}/${fileId}`;

export const filesRoute = new Hono<AppEnv>()
  .get('/:folder/:fileId', async (context) => {
    const workspaceId = await requireWorkspaceId(context);

    if (workspaceId === null) {
      return context.json({ error: 'UNAUTHENTICATED' }, 401);
    }

    const object = await context.env.FILES.get(
      buildObjectKey({
        workspaceId,
        folder: context.req.param('folder'),
        fileId: context.req.param('fileId'),
      }),
    );

    if (object === null) {
      return context.notFound();
    }

    const headers = new Headers();

    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    // Attachments are per-tenant; a shared cache must never hold one.
    headers.set('Cache-Control', 'private, max-age=3600');

    return new Response(object.body, { headers });
  })
  .put('/:folder/:fileId', async (context) => {
    const workspaceId = await requireWorkspaceId(context);

    if (workspaceId === null) {
      return context.json({ error: 'UNAUTHENTICATED' }, 401);
    }

    const key = buildObjectKey({
      workspaceId,
      folder: context.req.param('folder'),
      fileId: context.req.param('fileId'),
    });

    await context.env.FILES.put(key, context.req.raw.body, {
      httpMetadata: {
        contentType:
          context.req.header('Content-Type') ?? 'application/octet-stream',
      },
    });

    return context.json({ key }, 201);
  });
