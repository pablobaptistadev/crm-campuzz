import { type Client } from 'pg';

import { applyWorkspaceObjects } from 'src/ddl/create-workspace-schema';
import { escapeIdentifier } from 'src/ddl/escape';
import { persistObjectMetadata } from 'src/db/core/metadata-repository';
import { getWorkspaceSchemaName } from 'src/metadata/naming';
import { type FlatObjectMetadata } from 'src/metadata/types';
import { buildStandardObjects } from 'src/standard/objects';

export type BootstrapResult = {
  workspaceId: string;
  schemaName: string;
  objectCount: number;
};

// Creates a workspace end to end: the core row, its dedicated Postgres schema,
// the standard object metadata, and the real tables those objects map to.
export const bootstrapWorkspace = async ({
  client,
  displayName,
  subdomain,
  userId,
}: {
  client: Client;
  displayName: string;
  subdomain: string;
  userId: string;
}): Promise<BootstrapResult> => {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO core."workspace" ("displayName","subdomain","activationStatus")
     VALUES ($1,$2,'ONGOING_CREATION') RETURNING "id"`,
    [displayName, subdomain],
  );

  const workspaceId = rows[0].id;
  const schemaName = getWorkspaceSchemaName(workspaceId);
  const objects = buildStandardObjects(workspaceId);

  await client.query(
    `UPDATE core."workspace" SET "databaseSchema" = $2 WHERE "id" = $1`,
    [workspaceId, schemaName],
  );

  await client.query(
    `INSERT INTO core."userWorkspace" ("userId","workspaceId") VALUES ($1,$2)
     ON CONFLICT DO NOTHING`,
    [userId, workspaceId],
  );

  for (const object of objects) {
    await persistObjectMetadata({ client, object });
  }

  await applyWorkspaceObjects({ client, schemaName, objects });

  await seedDefaultViews({ client, workspaceId, objects });

  // Only flip to ACTIVE once the schema really exists: core."workspace" has a
  // CHECK constraint that an active workspace must carry a databaseSchema.
  await client.query(
    `UPDATE core."workspace" SET "activationStatus" = 'ACTIVE' WHERE "id" = $1`,
    [workspaceId],
  );

  return { workspaceId, schemaName, objectCount: objects.length };
};

// The front's navigation is driven by views, not by object metadata: without at
// least one view per object the sidebar renders empty.
export const seedDefaultViews = async ({
  client,
  workspaceId,
  objects,
  positionOffset = 0,
}: {
  client: Client;
  workspaceId: string;
  objects: FlatObjectMetadata[];
  positionOffset?: number;
}): Promise<void> => {
  const visibleObjects = objects.filter((object) => !object.isSystem);

  for (const [index, object] of visibleObjects.entries()) {
    await client.query(
      `INSERT INTO core."view" ("workspaceId","objectMetadataId","name","type","key","icon","position")
       VALUES ($1,$2,$3,'TABLE','INDEX',$4,$5)`,
      [
        workspaceId,
        object.id,
        `All ${object.labelPlural}`,
        object.icon,
        positionOffset + index,
      ],
    );
  }
};

export const seedWorkspaceMember = async ({
  client,
  workspaceId,
  userId,
  firstName,
  lastName,
  email,
}: {
  client: Client;
  workspaceId: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
}): Promise<void> => {
  const schemaName = getWorkspaceSchemaName(workspaceId);

  await client.query(
    `INSERT INTO ${escapeIdentifier(schemaName)}."workspaceMember"
       ("nameFirstName","nameLastName","userEmail","userId")
     VALUES ($1,$2,$3,$4)`,
    [firstName, lastName, email, userId],
  );
};
