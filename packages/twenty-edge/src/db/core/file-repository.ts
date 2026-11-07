import { type Client } from 'pg';

export type FileRow = {
  id: string;
  workspaceId: string;
  name: string;
  folder: string;
  size: string | number;
  type: string | null;
  fieldMetadataId: string | null;
  uploadedAt: Date | null;
  createdAt: Date;
};

export const insertFile = async ({
  client,
  workspaceId,
  name,
  folder,
  size,
  type,
  fieldMetadataId,
  createdByUserId,
}: {
  client: Client;
  workspaceId: string;
  name: string;
  folder: string;
  size: number;
  type: string | null;
  fieldMetadataId: string | null;
  createdByUserId: string | null;
}): Promise<FileRow> => {
  const { rows } = await client.query<FileRow>(
    `INSERT INTO core."file"
       ("workspaceId","name","folder","size","type","fieldMetadataId","createdByUserId")
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING "id","workspaceId","name","folder","size","type","fieldMetadataId","uploadedAt","createdAt"`,
    [workspaceId, name, folder, size, type, fieldMetadataId, createdByUserId],
  );

  return rows[0];
};

export const findFileById = async ({
  client,
  workspaceId,
  fileId,
}: {
  client: Client;
  workspaceId: string;
  fileId: string;
}): Promise<FileRow | null> => {
  const { rows } = await client.query<FileRow>(
    `SELECT "id","workspaceId","name","folder","size","type","fieldMetadataId","uploadedAt","createdAt"
     FROM core."file"
     WHERE "id" = $1 AND "workspaceId" = $2 AND "deletedAt" IS NULL`,
    [fileId, workspaceId],
  );

  return rows[0] ?? null;
};

// Called once the bytes are in R2: until then the row describes an upload that
// may never arrive, and nothing should serve it as a file.
export const markFileUploaded = async ({
  client,
  workspaceId,
  fileId,
  size,
}: {
  client: Client;
  workspaceId: string;
  fileId: string;
  size: number | null;
}): Promise<FileRow | null> => {
  const { rows } = await client.query<FileRow>(
    `UPDATE core."file"
     SET "uploadedAt" = now(),
         "size" = COALESCE($3, "size"),
         "updatedAt" = now()
     WHERE "id" = $1 AND "workspaceId" = $2 AND "deletedAt" IS NULL
     RETURNING "id","workspaceId","name","folder","size","type","fieldMetadataId","uploadedAt","createdAt"`,
    [fileId, workspaceId, size],
  );

  return rows[0] ?? null;
};
