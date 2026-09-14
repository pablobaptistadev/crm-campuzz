export type Bindings = {
  BROWSER: Fetcher;
  ARTIFACTS: R2Bucket;

  TARGET_URL: string;
  TEST_EMAIL: string;

  TEST_PASSWORD?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
};

export type AppEnv = { Bindings: Bindings };
