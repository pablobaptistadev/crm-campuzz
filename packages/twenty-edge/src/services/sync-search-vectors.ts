import { type Client } from 'pg';

import {
  buildSearchVectorStatements,
  UNACCENT_IMMUTABLE_STATEMENT,
} from 'src/ddl/search-vector';
import { type FlatObjectMetadata } from 'src/metadata/types';
import { buildWorkspaceTableShape } from 'src/orm/table-shape';

// The column is generated from the object's own text columns, so it has to be
// rebuilt whenever those change — adding a field otherwise leaves it out of
// search with no sign that anything is wrong.
export const syncSearchVector = async ({
  client,
  workspaceId,
  object,
}: {
  client: Client;
  workspaceId: string;
  object: FlatObjectMetadata;
}): Promise<void> => {
  if (!object.isSearchable) {
    return;
  }

  const shape = buildWorkspaceTableShape({ object, workspaceId });

  await client.query(UNACCENT_IMMUTABLE_STATEMENT);

  for (const statement of buildSearchVectorStatements({ object, shape })) {
    await client.query(statement);
  }
};

export const syncSearchVectors = async ({
  client,
  workspaceId,
  objects,
}: {
  client: Client;
  workspaceId: string;
  objects: FlatObjectMetadata[];
}): Promise<string[]> => {
  const synced: string[] = [];

  await client.query(UNACCENT_IMMUTABLE_STATEMENT);

  for (const object of objects) {
    if (!object.isActive || !object.isSearchable) {
      continue;
    }

    const shape = buildWorkspaceTableShape({ object, workspaceId });

    for (const statement of buildSearchVectorStatements({ object, shape })) {
      await client.query(statement);
    }

    synced.push(object.nameSingular);
  }

  return synced;
};
