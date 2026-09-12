export type Bindings = {
  HYPERDRIVE: Hyperdrive;
  ASSETS: Fetcher;
  FILES: R2Bucket;
  METADATA_CACHE: KVNamespace;

  SERVER_URL: string;
  FRONT_DOMAIN: string;
  DEFAULT_SUBDOMAIN: string;
  IS_MULTIWORKSPACE_ENABLED: string;
  IS_EMAIL_VERIFICATION_REQUIRED: string;
  SIGN_IN_PREFILLED: string;

  APP_SECRET?: string;
  SENTRY_FRONT_DSN?: string;
  CAPTCHA_SITE_KEY?: string;
  CAPTCHA_PROVIDER?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
};

// Per-request state. Replaces the AsyncLocalStorage + Nest DI the old server used:
// a Worker isolate is shared across tenants, so nothing tenant-scoped may live in
// module scope.
export type RequestContext = {
  userId: string | null;
  workspaceId: string | null;
  userWorkspaceId: string | null;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: { requestContext: RequestContext };
};

export const parseBooleanEnvironmentVariable = (
  value: string | undefined,
  fallback = false,
): boolean => (value === undefined ? fallback : value === 'true');
