import { type Bindings, parseBooleanEnvironmentVariable } from 'src/env';

// Shape consumed by twenty-front's useClientConfig. Every field the front reads
// unconditionally must be present — a missing one leaves the app on its loading
// skeleton with no error, because DomainShell blocks the whole render on it.
export type ClientConfig = {
  appVersion: string | null;
  authProviders: {
    google: boolean;
    microsoft: boolean;
    password: boolean;
    sso: unknown[];
  };
  billing: {
    isBillingEnabled: boolean;
    billingUrl: string;
    stripePublishableKey: string;
    trialPeriods: unknown[];
  };
  aiModels: unknown[];
  aiModelTiers: unknown[];
  signInPrefilled: boolean;
  isMultiWorkspaceEnabled: boolean;
  isEmailVerificationRequired: boolean;
  defaultSubdomain: string;
  frontDomain: string;
  publicFunctionDomain: string | null;
  analyticsEnabled: boolean;
  support: { supportDriver: string; supportFrontChatId: string | null };
  isAttachmentPreviewEnabled: boolean;
  sentry: {
    environment: string | null;
    release: string | null;
    dsn: string | null;
    tracesSampleRate: number | null;
  };
  captcha: { provider: string | null; siteKey: string | null };
  api: { mutationMaximumAffectedRecords: number };
  canManageFeatureFlags: boolean;
  publicFeatureFlags: unknown[];
  isCookieSessionEnabled: boolean;
  isMicrosoftMessagingEnabled: boolean;
  isMicrosoftCalendarEnabled: boolean;
  isGoogleMessagingEnabled: boolean;
  isGoogleCalendarEnabled: boolean;
  isConfigVariablesInDbEnabled: boolean;
  isImapSmtpCaldavEnabled: boolean;
  isEmailingDomainInDemoMode: boolean;
  allowRequestsToTwentyIcons: boolean;
  calendarBookingPageId: string | null;
  isBookCallOnboardingStepEnabled: boolean;
  isCompanyEnrichmentEnabled: boolean;
  isCloudflareIntegrationEnabled: boolean;
  isClickHouseConfigured: boolean;
  isWorkspaceSchemaDDLLocked: boolean;
  isOnboardingAiChatEnabled: boolean;
  enterpriseInstanceType: string;
  maintenance: { startAt: string; endAt: string; link: string | null } | null;
};

const MUTATION_MAXIMUM_AFFECTED_RECORDS = 100;

export const buildClientConfig = (bindings: Bindings): ClientConfig => ({
  appVersion: null,
  authProviders: {
    google: false,
    microsoft: false,
    password: true,
    sso: [],
  },
  billing: {
    isBillingEnabled: false,
    billingUrl: '',
    stripePublishableKey: bindings.STRIPE_PUBLISHABLE_KEY ?? '',
    trialPeriods: [],
  },
  aiModels: [],
  aiModelTiers: [],
  signInPrefilled: parseBooleanEnvironmentVariable(bindings.SIGN_IN_PREFILLED),
  isMultiWorkspaceEnabled: parseBooleanEnvironmentVariable(
    bindings.IS_MULTIWORKSPACE_ENABLED,
  ),
  isEmailVerificationRequired: parseBooleanEnvironmentVariable(
    bindings.IS_EMAIL_VERIFICATION_REQUIRED,
  ),
  defaultSubdomain: bindings.DEFAULT_SUBDOMAIN,
  frontDomain: bindings.FRONT_DOMAIN,
  publicFunctionDomain: null,
  analyticsEnabled: false,
  support: { supportDriver: 'none', supportFrontChatId: null },
  isAttachmentPreviewEnabled: true,
  sentry: {
    environment: null,
    release: null,
    dsn: bindings.SENTRY_FRONT_DSN ?? null,
    tracesSampleRate: null,
  },
  captcha: {
    provider: bindings.CAPTCHA_PROVIDER ?? null,
    siteKey: bindings.CAPTCHA_SITE_KEY ?? null,
  },
  api: { mutationMaximumAffectedRecords: MUTATION_MAXIMUM_AFFECTED_RECORDS },
  canManageFeatureFlags: false,
  publicFeatureFlags: [],
  // Cookie sessions are the only web auth path; the field stays because
  // removing it would break the published API contract.
  isCookieSessionEnabled: true,
  isMicrosoftMessagingEnabled: false,
  isMicrosoftCalendarEnabled: false,
  isGoogleMessagingEnabled: false,
  isGoogleCalendarEnabled: false,
  isConfigVariablesInDbEnabled: false,
  isImapSmtpCaldavEnabled: false,
  isEmailingDomainInDemoMode: false,
  allowRequestsToTwentyIcons: true,
  calendarBookingPageId: null,
  isBookCallOnboardingStepEnabled: false,
  isCompanyEnrichmentEnabled: false,
  isCloudflareIntegrationEnabled: false,
  isClickHouseConfigured: false,
  isWorkspaceSchemaDDLLocked: false,
  isOnboardingAiChatEnabled: false,
  enterpriseInstanceType: 'PRODUCTION',
  maintenance: null,
});
