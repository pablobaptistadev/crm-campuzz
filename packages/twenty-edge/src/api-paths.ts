// Mirrors ApiPath in twenty-shared. Kept as a local copy so the Worker has no
// dependency on the server package; the two must stay in sync.
//
// /financeiro is left out on purpose: it is also a page of the clube SPA, and
// listing it here answered a reload of that page with a 501. The API under
// /financeiro/* still works, because its routes match before the catch-all.
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
