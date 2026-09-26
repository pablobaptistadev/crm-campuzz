import { type Context, Hono } from 'hono';

import { findSessionContext } from 'src/db/core/auth-repository';
import { findFileById, markFileUploaded } from 'src/db/core/file-repository';
import { withDatabaseClient } from 'src/db/client';
import { tipoDoArquivo } from 'src/services/tipo-de-arquivo';
import { hashSessionToken, readSessionToken } from 'src/auth/session';
import { verifyUploadToken } from 'src/auth/upload-token';
import { type AppEnv } from 'src/env';

const resolveWorkspaceIdFromSession = async (
  context: Context<AppEnv>,
): Promise<string | null> =>
  withDatabaseClient(context.env, context.executionCtx, async (client) => {
    const sessionToken = readSessionToken(context);

    if (sessionToken === null) {
      return null;
    }

    const sessionContext = await findSessionContext({
      client,
      tokenHash: await hashSessionToken(sessionToken),
    });

    return sessionContext?.membership?.workspace.id ?? null;
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
    const workspaceId = await resolveWorkspaceIdFromSession(context);

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
    const appSecret = context.env.APP_SECRET;
    const token = context.req.query('token');
    const fileId = context.req.param('fileId');
    const folder = context.req.param('folder');

    if (appSecret === undefined || token === undefined) {
      return context.json({ error: 'UPLOAD_TOKEN_REQUIRED' }, 401);
    }

    const claims = await verifyUploadToken({ appSecret, token });

    // The token names the file it may write. Without that check any valid
    // token would be a write capability over the whole bucket.
    if (claims === null || claims.fileId !== fileId) {
      return context.json({ error: 'UPLOAD_TOKEN_INVALID' }, 403);
    }

    return withDatabaseClient(context.env, context.executionCtx, async (client) => {
      const file = await findFileById({
        client,
        workspaceId: claims.workspaceId,
        fileId,
      });

      if (file === null || file.folder !== folder) {
        return context.json({ error: 'FILE_NOT_FOUND' }, 404);
      }

      const body = await context.req.arrayBuffer();

      await context.env.FILES.put(
        buildObjectKey({ workspaceId: claims.workspaceId, folder, fileId }),
        body,
        {
          httpMetadata: {
            // O nome do arquivo decide, não o cabeçalho: quem faz o PUT pode
            // mandar qualquer coisa, e é este tipo que volta na leitura.
            contentType: tipoDoArquivo(file.name),
          },
        },
      );

      // The size the client declared before uploading is a claim; this is the
      // number of bytes that actually arrived.
      await markFileUploaded({
        client,
        workspaceId: claims.workspaceId,
        fileId,
        size: body.byteLength,
      });

      return context.json({ fileId, size: body.byteLength }, 201);
    });
  });
