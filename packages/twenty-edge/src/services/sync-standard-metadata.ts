import { type Client } from 'pg';

import {
  buildCreateTableStatements,
  buildForeignKeyStatements,
} from 'src/ddl/create-workspace-schema';
import {
  bumpMetadataVersion,
  loadWorkspaceMetadata,
  persistFieldMetadata,
  persistObjectMetadata,
} from 'src/db/core/metadata-repository';
import {
  computeTableName,
  getWorkspaceSchemaName,
} from 'src/metadata/naming';
import { applyFieldColumns } from 'src/services/metadata-mutations';
import { seedDefaultViews } from 'src/services/bootstrap-workspace';
import { buildStandardObjects } from 'src/standard/objects';

export type SyncStandardMetadataResult = {
  createdObjects: string[];
  createdFields: string[];
};

// The seed only ran when a workspace was created, so every standard object or
// field added afterwards left existing workspaces behind — that is how
// `authoredAttachments` ended up needing a hand-written migration. Standard ids
// are derived from the workspace id and the name, so comparing them is enough
// to tell what is missing, and running this twice changes nothing.
export const syncStandardMetadata = async ({
  client,
  workspaceId,
}: {
  client: Client;
  workspaceId: string;
}): Promise<SyncStandardMetadataResult> => {
  const schemaName = getWorkspaceSchemaName(workspaceId);
  const standardObjects = buildStandardObjects(workspaceId);

  const current = await loadWorkspaceMetadata({
    client,
    workspaceId,
    // Any version works: this reads the rows, it does not cache them.
    metadataVersion: 0,
  });

  const currentObjectById = new Map(
    current.objects.map((object) => [object.id, object]),
  );

  const createdObjects: string[] = [];
  const createdFields: string[] = [];

  for (const object of standardObjects) {
    const existing = currentObjectById.get(object.id);

    if (existing === undefined) {
      await persistObjectMetadata({ client, object });

      for (const statement of buildCreateTableStatements({
        object,
        schemaName,
      })) {
        await client.query(statement);
      }

      createdObjects.push(object.nameSingular);
      continue;
    }

    const existingFieldIds = new Set(existing.fields.map((field) => field.id));
    const tableName = computeTableName(object.nameSingular, object.isCustom);

    for (const field of object.fields) {
      if (existingFieldIds.has(field.id)) {
        continue;
      }

      await applyFieldColumns({ client, schemaName, tableName, field });
      await persistFieldMetadata({ client, field });

      createdFields.push(`${object.nameSingular}.${field.name}`);
    }
  }

  if (createdObjects.length === 0 && createdFields.length === 0) {
    return { createdObjects, createdFields };
  }

  // Foreign keys run over the whole set: a new object's relation can point at
  // one that already existed, and vice versa.
  for (const statement of buildForeignKeyStatements({
    objects: standardObjects,
    schemaName,
  })) {
    await client.query(statement);
  }

  const objectsNeedingView = standardObjects.filter((object) =>
    createdObjects.includes(object.nameSingular),
  );

  if (objectsNeedingView.length > 0) {
    await seedDefaultViews({
      client,
      workspaceId,
      objects: objectsNeedingView,
      positionOffset: current.objects.length,
    });
  }

  await bumpMetadataVersion({ client, workspaceId });

  return { createdObjects, createdFields };
};
