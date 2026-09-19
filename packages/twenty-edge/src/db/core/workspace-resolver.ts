import { type Client } from 'pg';

import {
  findWorkspaceBySubdomain,
  type WorkspaceRow,
} from 'src/db/core/auth-repository';

const stripPort = (host: string): string => host.split(':')[0];

const findWorkspaceByCustomDomain = async ({
  client,
  customDomain,
}: {
  client: Client;
  customDomain: string;
}): Promise<WorkspaceRow | null> => {
  const { rows } = await client.query<WorkspaceRow>(
    `SELECT "id","displayName","subdomain","customDomain","activationStatus","databaseSchema","metadataVersion"
     FROM core."workspace"
     WHERE "customDomain" = $1 AND "deletedAt" IS NULL`,
    [customDomain],
  );

  return rows[0] ?? null;
};

// Whitelabel resolution: the tenant comes from the Host header, not from the
// session. A user with access to several workspaces therefore lands in the one
// whose domain they typed, which is what makes per-workspace domains mean
// anything.
export const resolveWorkspaceFromHost = async ({
  client,
  host,
  appDomain,
}: {
  client: Client;
  host: string | undefined;
  appDomain: string | undefined;
}): Promise<WorkspaceRow | null> => {
  if (host === undefined || host.length === 0) {
    return null;
  }

  const hostname = stripPort(host).toLowerCase();
  const normalizedAppDomainForHost = appDomain?.toLowerCase() ?? '';

  // A host under the app domain can only be a subdomain tenant, so the custom
  // domain lookup is skipped: it would be one more transatlantic round trip on
  // the hot path for a row that cannot exist.
  const couldBeCustomDomain =
    normalizedAppDomainForHost.length === 0 ||
    !hostname.endsWith(normalizedAppDomainForHost);

  const byCustomDomain = couldBeCustomDomain
    ? await findWorkspaceByCustomDomain({ client, customDomain: hostname })
    : null;

  if (byCustomDomain !== null) {
    return byCustomDomain;
  }

  if (appDomain === undefined || appDomain.length === 0) {
    return null;
  }

  const normalizedAppDomain = appDomain.toLowerCase();

  if (!hostname.endsWith(`.${normalizedAppDomain}`)) {
    return null;
  }

  const subdomain = hostname.slice(
    0,
    hostname.length - normalizedAppDomain.length - 1,
  );

  // Only a single label is a workspace subdomain; anything deeper is not ours.
  if (subdomain.length === 0 || subdomain.includes('.')) {
    return null;
  }

  return findWorkspaceBySubdomain({ client, subdomain });
};
