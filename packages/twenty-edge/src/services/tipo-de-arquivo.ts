// O tipo do arquivo vinha do cliente e caía em application/octet-stream, então
// uma foto subia e voltava como binário genérico: o navegador oferece baixar em
// vez de mostrar, e um <img> depende de adivinhação. A extensão é a única pista
// que temos antes dos bytes chegarem, e é o bastante.
const TIPO_POR_EXTENSAO: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  heic: 'image/heic',
  bmp: 'image/bmp',
  ico: 'image/x-icon',

  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  json: 'application/json',
  xml: 'application/xml',

  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

  zip: 'application/zip',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
};

export const TIPO_PADRAO = 'application/octet-stream';

export const tipoDoArquivo = (nomeDoArquivo: string): string => {
  const ponto = nomeDoArquivo.lastIndexOf('.');

  if (ponto === -1 || ponto === nomeDoArquivo.length - 1) {
    return TIPO_PADRAO;
  }

  return TIPO_POR_EXTENSAO[nomeDoArquivo.slice(ponto + 1).toLowerCase()] ?? TIPO_PADRAO;
};

// SVG é imagem e é script ao mesmo tempo: servido inline, roda no domínio do
// CRM e lê a sessão de quem abriu. Guardamos o tipo real e deixamos o download
// forçar o caminho seguro.
export const ehInlineSeguro = (tipo: string): boolean =>
  tipo.startsWith('image/') && tipo !== 'image/svg+xml';
