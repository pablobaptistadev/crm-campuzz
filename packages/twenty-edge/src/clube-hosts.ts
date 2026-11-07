export const CLUBE_HOSTNAME = 'clubes.campuzz.com.br';
// The app answered on the singular first. Bookmarks, the login e-mail and the
// photo URLs already stored point there, so it stays served and redirects
// instead of breaking.
export const CLUBE_HOSTNAME_ANTIGO = 'clube.campuzz.com.br';

export const isClubeHostname = (hostname: string): boolean =>
  hostname === CLUBE_HOSTNAME || hostname === CLUBE_HOSTNAME_ANTIGO;
