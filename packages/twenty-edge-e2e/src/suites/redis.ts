import { type Bindings } from 'src/env';
import { assert, assertEqual, Recorder, type StepResult } from 'src/runner';

type UpstashResult<TValue> = { result: TValue; error?: string };

// Talks to Upstash over the same REST transport the API uses, so a green run
// here means the API's own cache path can reach Redis too.
const command = async <TValue>(
  bindings: Bindings,
  args: (string | number)[],
): Promise<{ value: TValue; latencyMs: number }> => {
  const url = bindings.UPSTASH_REDIS_REST_URL ?? '';
  const token = bindings.UPSTASH_REDIS_REST_TOKEN ?? '';
  const startedAt = Date.now();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });

  const latencyMs = Date.now() - startedAt;
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `${args[0]} failed with ${response.status}: ${text.slice(0, 200)}`,
    );
  }

  const body = JSON.parse(text) as UpstashResult<TValue>;

  if (body.error !== undefined) {
    throw new Error(`${args[0]} returned an error: ${body.error}`);
  }

  return { value: body.result, latencyMs };
};

export const runRedisSuite = async (
  bindings: Bindings,
): Promise<{ steps: StepResult[] }> => {
  const recorder = new Recorder('redis');

  if (
    (bindings.UPSTASH_REDIS_REST_URL ?? '').length === 0 ||
    (bindings.UPSTASH_REDIS_REST_TOKEN ?? '').length === 0
  ) {
    recorder.skip(
      'redis',
      'UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN secrets are not set on this Worker',
    );

    return { steps: recorder.steps };
  }

  const keyPrefix = `e2e:${Date.now().toString(36)}`;

  await recorder.step('PING answers', async () => {
    const { value, latencyMs } = await command<string>(bindings, ['PING']);

    assertEqual(value, 'PONG', 'PING reply');

    return { latencyMs };
  });

  await recorder.step('SET then GET round-trips a string', async () => {
    const payload = `campuzz-${keyPrefix}`;

    const write = await command<string>(bindings, [
      'SET',
      `${keyPrefix}:string`,
      payload,
      'PX',
      60_000,
    ]);

    assertEqual(write.value, 'OK', 'SET reply');

    const read = await command<string>(bindings, [
      'GET',
      `${keyPrefix}:string`,
    ]);

    assertEqual(read.value, payload, 'GET returns what SET wrote');

    return { writeLatencyMs: write.latencyMs, readLatencyMs: read.latencyMs };
  });

  await recorder.step('a JSON value survives the round-trip', async () => {
    const payload = {
      workspaceId: '00000000-0000-0000-0000-000000000000',
      metadataVersion: 7,
      objects: ['company', 'person'],
      acentuação: 'São Paulo',
    };

    await command<string>(bindings, [
      'SET',
      `${keyPrefix}:json`,
      JSON.stringify(payload),
      'PX',
      60_000,
    ]);

    const read = await command<string | null>(bindings, [
      'GET',
      `${keyPrefix}:json`,
    ]);

    assert(read.value !== null, 'JSON key readable');

    const parsed = JSON.parse(read.value ?? '{}') as typeof payload;

    assertEqual(parsed.metadataVersion, 7, 'number survives');
    assertEqual(parsed.acentuação, 'São Paulo', 'UTF-8 survives');
    assertEqual(parsed.objects.length, 2, 'array survives');

    return { latencyMs: read.latencyMs, bytes: (read.value ?? '').length };
  });

  await recorder.step('INCR counts and EXPIRE sets a TTL', async () => {
    const key = `${keyPrefix}:counter`;

    const first = await command<number>(bindings, ['INCRBY', key, 1]);
    const second = await command<number>(bindings, ['INCRBY', key, 4]);

    assertEqual(first.value, 1, 'first increment');
    assertEqual(second.value, 5, 'second increment accumulates');

    await command<number>(bindings, ['PEXPIRE', key, 60_000]);

    const ttl = await command<number>(bindings, ['PTTL', key]);

    assert(
      ttl.value > 0 && ttl.value <= 60_000,
      `TTL in range (got ${ttl.value})`,
    );

    return { counter: second.value, ttlMs: ttl.value };
  });

  await recorder.step('SET NX behaves as a lock', async () => {
    const key = `${keyPrefix}:lock`;

    const acquired = await command<string | null>(bindings, [
      'SET',
      key,
      'holder-a',
      'NX',
      'PX',
      30_000,
    ]);

    assertEqual(acquired.value, 'OK', 'first holder wins the lock');

    const contended = await command<string | null>(bindings, [
      'SET',
      key,
      'holder-b',
      'NX',
      'PX',
      30_000,
    ]);

    assertEqual(contended.value, null, 'second holder is refused');

    await command<number>(bindings, ['DEL', key]);

    const reacquired = await command<string | null>(bindings, [
      'SET',
      key,
      'holder-b',
      'NX',
      'PX',
      30_000,
    ]);

    assertEqual(reacquired.value, 'OK', 'lock is reusable once released');

    return { acquiredLatencyMs: acquired.latencyMs };
  });

  await recorder.step('the API cache namespaces are writable', async () => {
    // Same key shapes the Worker's CacheStorage builds, so a permission or
    // key-pattern problem shows up here rather than in production traffic.
    const namespaces = [
      'engine:workspace',
      'engine:lock',
      'engine:usage-limit',
      'engine:auth-throttle',
    ];

    const results: Record<string, number> = {};

    for (const namespace of namespaces) {
      const key = `${namespace}:${keyPrefix}`;
      const write = await command<string>(bindings, [
        'SET',
        key,
        'probe',
        'PX',
        30_000,
      ]);

      assertEqual(write.value, 'OK', `write to ${namespace}`);

      const read = await command<string | null>(bindings, ['GET', key]);

      assertEqual(read.value, 'probe', `read back from ${namespace}`);

      await command<number>(bindings, ['DEL', key]);

      results[namespace] = write.latencyMs;
    }

    return results;
  });

  await recorder.step('DEL removes the keys this run created', async () => {
    const deleted = await command<number>(bindings, [
      'DEL',
      `${keyPrefix}:string`,
      `${keyPrefix}:json`,
      `${keyPrefix}:counter`,
      `${keyPrefix}:lock`,
    ]);

    assertEqual(deleted.value, 4, 'four keys deleted');

    const missing = await command<string | null>(bindings, [
      'GET',
      `${keyPrefix}:string`,
    ]);

    assertEqual(missing.value, null, 'deleted key reads back as null');

    return { deleted: deleted.value };
  });

  return { steps: recorder.steps };
};
