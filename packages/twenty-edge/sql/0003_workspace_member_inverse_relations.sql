-- attachment.author and task.assignee were seeded pointing at inverse fields on
-- workspaceMember that the standard metadata never declared. The front reads
-- relation.targetFieldMetadata.id without a null guard, so every record page of
-- an object with such a field rendered the error boundary instead.
--
-- The ids are deterministic (workspaceId + path), so they are the same ones the
-- seed now produces: a workspace created after this fix already has these rows
-- and the insert is a no-op for it.
INSERT INTO core."fieldMetadata"
  ("id","workspaceId","objectMetadataId","name","label","type","isActive","isSystem",
   "isNullable","isUnique","settings","relationTargetFieldMetadataId","relationTargetObjectMetadataId")
VALUES
  ('f2249790-a3db-4100-8aa8-2061c7f6631d',
   'e49aabc1-df4f-4dca-909c-9dab67f20e25',
   'e427cb18-1c53-468f-83ad-eadb4b06607e',
   'authoredAttachments','Authored attachments','RELATION',true,false,true,false,
   '{"relationType":"ONE_TO_MANY"}'::jsonb,
   'a0d0807a-6c78-46f5-81de-6fe63a1ab04c',
   '8c7b6e16-ab08-4267-8354-f9d5b9b0bed4'),
  ('0fd42730-5c86-4aa9-808e-311f06d9b0d7',
   'e49aabc1-df4f-4dca-909c-9dab67f20e25',
   'e427cb18-1c53-468f-83ad-eadb4b06607e',
   'assignedTasks','Assigned tasks','RELATION',true,false,true,false,
   '{"relationType":"ONE_TO_MANY"}'::jsonb,
   '5b584317-f795-4966-854d-5960cfebaaae',
   '0042fe39-4bd6-4af7-8b07-c2a6f895f3f6')
ON CONFLICT ("id") DO NOTHING;

UPDATE core."workspace"
SET "metadataVersion" = "metadataVersion" + 1, "updatedAt" = now()
WHERE "id" = 'e49aabc1-df4f-4dca-909c-9dab67f20e25';
