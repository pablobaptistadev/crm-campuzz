export type Bindings = {
  HYPERDRIVE: Hyperdrive;
  ASSETS: Fetcher;
  FILES: R2Bucket;
  METADATA_CACHE: KVNamespace;

  SERVER_URL: string;
  FRONT_DOMAIN: string;
  DEFAULT_SUBDOMAIN: string;
  // Apex under which each workspace gets <subdomain>.<APP_DOMAIN>.
  APP_DOMAIN?: string;
  IS_MULTIWORKSPACE_ENABLED: string;
  IS_EMAIL_VERIFICATION_REQUIRED: string;
  SIGN_IN_PREFILLED: string;

  APP_SECRET?: string;
  // The only credential the whole roadmap adds. Without it an invitation is
  // still created and its link still works — we just cannot deliver it.
  // A SendGrid key, the one that starts with SG. — the same secret their SMTP
  // block carries as the password.
  SENDGRID_API_KEY?: string;
  EMAIL_FROM?: string;
  // Yoga masks resolver errors by default, which hides the cause during a
  // deploy-and-test loop. Never leave this on in front of real users.
  DEBUG_ERRORS?: string;
  METADATA_CACHE_ENABLED?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
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
