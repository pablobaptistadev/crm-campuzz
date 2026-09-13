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
import {
  orderedVisibleFields,
  seedDefaultViews,
  VISIBLE_VIEW_FIELD_COUNT,
} from 'src/services/bootstrap-workspace';
import { seedViewFields } from 'src/db/core/view-repository';
import { syncRoles } from 'src/services/sync-roles';
import { syncSearchVectors } from 'src/services/sync-search-vectors';
import { buildStandardObjects } from 'src/standard/objects';

export type SyncStandardMetadataResult = {
  createdObjects: string[];
  createdFields: string[];
  searchableObjects: string[];
  createdRoles: string[];
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
  const refreshedObjects: string[] = [];

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

    // The seed is the source of truth for the object's own attributes, so an
    // object that already exists still gets them refreshed — that is how a
    // workspace created before duplicateCriteria existed gets one.
    if (
      JSON.stringify(existing.duplicateCriteria) !==
      JSON.stringify(object.duplicateCriteria)
    ) {
      await client.query(
        `UPDATE core."objectMetadata"
         SET "duplicateCriteria" = $2, "updatedAt" = now()
         WHERE "id" = $1`,
        [
          object.id,
          object.duplicateCriteria === null
            ? null
            : JSON.stringify(object.duplicateCriteria),
        ],
      );

      refreshedObjects.push(object.nameSingular);
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

  // Views created before viewField existed have no columns at all, and a view
  // with no columns renders an empty table. Backfilling here means the same
  // call that catches up the metadata also catches up the views.
  const backfilledViews = await backfillViewFields({ client, workspaceId });

  // Always, not only when something changed: the search column is derived from
  // the object's columns, and this is where a workspace that predates search
  // gets one. Rebuilding an up-to-date column costs one reindex and is what
  // makes the call safe to run whenever anything looks out of step.
  const { objects: currentObjects } = await loadWorkspaceMetadata({
    client,
    workspaceId,
    metadataVersion: 0,
  });

  const searchableObjects = await syncSearchVectors({
    client,
    workspaceId,
    objects: currentObjects,
  });

  // Also always: a workspace that predates roles has none, and until it has one
  // every member is treated as an administrator.
  const { createdRoles } = await syncRoles({ client, workspaceId });

  if (
    createdObjects.length === 0 &&
    createdFields.length === 0 &&
    refreshedObjects.length === 0 &&
    backfilledViews === 0
  ) {
    return { createdObjects, createdFields, searchableObjects, createdRoles };
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

  return { createdObjects, createdFields, searchableObjects, createdRoles };
};

const backfillViewFields = async ({
  client,
  workspaceId,
}: {
  client: Client;
  workspaceId: string;
}): Promise<number> => {
  // Reloaded rather than reusing the seed: a custom object has views too, and
  // its fields are not in the standard set.
  const { objects } = await loadWorkspaceMetadata({
    client,
    workspaceId,
    metadataVersion: 0,
  });

  const { rows } = await client.query<{ id: string; objectMetadataId: string }>(
    `SELECT v."id", v."objectMetadataId"
     FROM core."view" v
     LEFT JOIN core."viewField" f
       ON f."viewId" = v."id" AND f."deletedAt" IS NULL
     WHERE v."workspaceId" = $1 AND v."deletedAt" IS NULL AND f."id" IS NULL
     GROUP BY v."id", v."objectMetadataId"`,
    [workspaceId],
  );

  const objectById = new Map(objects.map((object) => [object.id, object]));

  for (const view of rows) {
    const object = objectById.get(view.objectMetadataId);

    if (object === undefined) {
      continue;
    }

    await seedViewFields({
      client,
      workspaceId,
      viewId: view.id,
      fields: orderedVisibleFields(object),
      visibleCount: VISIBLE_VIEW_FIELD_COUNT,
    });
  }

  return rows.length;
};
