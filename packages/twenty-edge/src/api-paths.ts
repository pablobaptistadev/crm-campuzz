// Mirrors ApiPath in twenty-shared. Kept as a local copy so the Worker has no
// dependency on the server package; the two must stay in sync.
export const API_PATH_PREFIXES = new Set([
  'admin-panel',
  'app',
  'application-registration-claim',
  'apps',
  'auth',
  'client-config',
  'cloudflare',
  'emailing',
  'file',
  'file-upload',
  'files',
  'financeiro',
  'graphql',
  'healthz',
  'mcp',
  'metadata',
  'oauth',
  'open-api',
  'public-assets',
  'rest',
  // One-letter prefix for route triggers. Matching on the exact first segment
  // keeps /static/* on the SPA while /s/* reaches the API.
  's',
  'webhooks',
  '.well-known',
]);

export const isApiPath = (pathname: string): boolean => {
  const [, firstSegment = ''] = pathname.split('/');

  return API_PATH_PREFIXES.has(firstSegment);
};
