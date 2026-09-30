import { CACHE_NAMESPACES, createCacheStorage } from 'src/cache/cache-storage';
import { type Bindings } from 'src/env';
import { type WorkspaceMetadata } from 'src/metadata/types';

// Keyed by metadataVersion, so a schema change makes the old entry unreachable
// instead of needing an explicit invalidation.
const buildCacheKey = ({
  workspaceId,
  metadataVersion,
}: {
  workspaceId: string;
  metadataVersion: number;
}): string => `${workspaceId}:${metadataVersion}`;

const CACHE_TTL_MS = 3_600_000;

export const readCachedMetadata = async ({
  bindings,
  workspaceId,
  metadataVersion,
}: {
  bindings: Bindings;
  workspaceId: string;
  metadataVersion: number;
}): Promise<WorkspaceMetadata | null> => {
  const cache = createCacheStorage({
    bindings,
    namespace: CACHE_NAMESPACES.engineWorkspace,
  });

  return cache.get<WorkspaceMetadata>(
    buildCacheKey({ workspaceId, metadataVersion }),
  );
};

export const writeCachedMetadata = async ({
  bindings,
  metadata,
}: {
  bindings: Bindings;
  metadata: WorkspaceMetadata;
}): Promise<void> => {
  const cache = createCacheStorage({
    bindings,
    namespace: CACHE_NAMESPACES.engineWorkspace,
  });

  await cache.set(
    buildCacheKey({
      workspaceId: metadata.workspaceId,
      metadataVersion: metadata.metadataVersion,
    }),
    metadata,
    CACHE_TTL_MS,
  );
};
