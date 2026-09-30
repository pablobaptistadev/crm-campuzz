import { Redis } from '@upstash/redis/cloudflare';

import { type Bindings } from 'src/env';

// Same namespaces Twenty uses (cache-storage-namespace.enum.ts), so keys stay
// recognizable and a future migration can share the keyspace.
export const CACHE_NAMESPACES = {
  engineWorkspace: 'engine:workspace',
  engineCoreEntity: 'engine:core-entity',
  engineAuthSession: 'engine:auth-session',
  engineLock: 'engine:lock',
  engineHealth: 'engine:health',
  engineMetrics: 'engine:metrics',
  engineSubscriptions: 'engine:subscriptions',
  engineUsageLimit: 'engine:usage-limit',
  moduleMessaging: 'module:messaging',
  moduleWorkflow: 'module:workflow',
} as const;

export type CacheNamespace =
  (typeof CACHE_NAMESPACES)[keyof typeof CACHE_NAMESPACES];

// REST, not TCP: a Worker cannot keep a socket across requests, so every
// ioredis-shaped API in the old server has to become a fetch call here.
const createClient = (bindings: Bindings): Redis | null => {
  const url = bindings.UPSTASH_REDIS_REST_URL;
  const token = bindings.UPSTASH_REDIS_REST_TOKEN;

  return url === undefined || token === undefined
    ? null
    : new Redis({ url, token });
};

export type CacheStorage = {
  get: <TValue>(key: string) => Promise<TValue | null>;
  set: <TValue>(key: string, value: TValue, ttlMs?: number) => Promise<void>;
  setIfAbsent: <TValue>(
    key: string,
    value: TValue,
    ttlMs: number,
  ) => Promise<boolean>;
  del: (key: string) => Promise<void>;
  incrementBy: (key: string, increment: number) => Promise<number>;
  expire: (key: string, ttlMs: number) => Promise<boolean>;
  acquireLock: (key: string, ttlMs?: number) => Promise<boolean>;
  releaseLock: (key: string) => Promise<void>;
  isAvailable: boolean;
};

const DEFAULT_LOCK_TTL_MS = 1000;

export const createCacheStorage = ({
  bindings,
  namespace,
}: {
  bindings: Bindings;
  namespace: CacheNamespace;
}): CacheStorage => {
  const redis = createClient(bindings);
  const buildKey = (key: string): string => `${namespace}:${key}`;

  // A cache outage must degrade to a slower request, never to a failed one.
  // Every read swallows its error; writes do the same.
  const guard = async <TResult>(
    run: () => Promise<TResult>,
    fallback: TResult,
  ): Promise<TResult> => {
    if (redis === null) {
      return fallback;
    }

    try {
      return await run();
    } catch {
      return fallback;
    }
  };

  return {
    isAvailable: redis !== null,

    get: <TValue>(key: string) =>
      guard<TValue | null>(
        () => (redis as Redis).get<TValue>(buildKey(key)),
        null,
      ),

    set: async (key, value, ttlMs) => {
      await guard(
        () =>
          ttlMs === undefined || ttlMs <= 0
            ? (redis as Redis).set(buildKey(key), value)
            : (redis as Redis).set(buildKey(key), value, { px: ttlMs }),
        null,
      );
    },

    // SET NX PX — the same primitive Twenty's setIfAbsent uses.
    setIfAbsent: (key, value, ttlMs) =>
      guard(async () => {
        const result =
          ttlMs > 0
            ? await (redis as Redis).set(buildKey(key), value, {
                nx: true,
                px: ttlMs,
              })
            : await (redis as Redis).set(buildKey(key), value, { nx: true });

        return result === 'OK';
      }, false),

    del: async (key) => {
      await guard(() => (redis as Redis).del(buildKey(key)), 0);
    },

    incrementBy: (key, increment) =>
      guard(() => (redis as Redis).incrby(buildKey(key), increment), 0),

    expire: (key, ttlMs) =>
      guard(async () => {
        const result = await (redis as Redis).expire(
          buildKey(key),
          Math.ceil(ttlMs / 1000),
        );

        return result === 1;
      }, false),

    acquireLock: (key, ttlMs = DEFAULT_LOCK_TTL_MS) =>
      guard(async () => {
        const result = await (redis as Redis).set(buildKey(key), 'lock', {
          nx: true,
          px: ttlMs,
        });

        return result === 'OK';
      }, false),

    releaseLock: async (key) => {
      await guard(() => (redis as Redis).del(buildKey(key)), 0);
    },
  };
};
