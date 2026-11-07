// A especificação da foto vive no domínio porque é regra do produto, não
// detalhe de implementação: quem trocar canvas por outra coisa continua
// entregando 400x400 em webp.

export const LADO_DA_FOTO = 400;
export const FORMATO_DA_FOTO = 'image/webp';
export const EXTENSAO_DA_FOTO = 'webp';
export const QUALIDADE_DA_FOTO = 0.9;

export type Recorte = { origemX: number; origemY: number; lado: number };

export const ZOOM_MINIMO = 1;
export const ZOOM_MAXIMO = 4;

export const limitarZoom = (zoom: number): number =>
  Math.min(Math.max(Number.isFinite(zoom) ? zoom : ZOOM_MINIMO, ZOOM_MINIMO), ZOOM_MAXIMO);

/**
 * O quadrado da imagem original que vira a foto.
 *
 * Zoom 1 é o maior quadrado que cabe; acima disso o quadrado encolhe, que é o
 * mesmo que aproximar. O deslocamento vem em pixels da imagem original, e é
 * preso às bordas: sem isso arrastar até o fim deixaria faixa vazia na foto,
 * e uma faixa vazia é pior que um recorte apertado.
 */
export const recorteDe = ({
  largura,
  altura,
  zoom,
  deslocX,
  deslocY,
}: {
  largura: number;
  altura: number;
  zoom: number;
  deslocX: number;
  deslocY: number;
}): Recorte => {
  const lado = Math.max(
    1,
    Math.round(Math.min(largura, altura) / limitarZoom(zoom)),
  );
  const preso = (centro: number, limite: number) =>
    Math.round(Math.min(Math.max(centro - lado / 2, 0), Math.max(0, limite - lado)));

  return {
    origemX: preso(largura / 2 + deslocX, largura),
    origemY: preso(altura / 2 + deslocY, altura),
    lado,
  };
};

const SEM_CONVERSAO = new Set(['image/svg+xml', 'image/gif']);

// SVG é script disfarçado de imagem e o canvas o rasterizaria perdendo tudo;
// GIF perderia a animação. Os dois sobem como vieram — anexo, nunca foto.
export const deveConverterParaWebp = (tipo: string): boolean =>
  tipo.startsWith('image/') && tipo !== FORMATO_DA_FOTO && !SEM_CONVERSAO.has(tipo);

export const ehImagem = (tipo: string): boolean => tipo.startsWith('image/');

export const nomeEmWebp = (nomeOriginal: string): string => {
  const ponto = nomeOriginal.lastIndexOf('.');
  const base = ponto === -1 ? nomeOriginal : nomeOriginal.slice(0, ponto);

  return `${base || 'imagem'}.${EXTENSAO_DA_FOTO}`;
};

// Imagens que não são quadradas viram quadradas pelo centro, não esticadas:
// esticar deforma o rosto, que é justamente o que a foto existe para mostrar.
// É o recorte de quem não mexeu em nada — o mesmo cálculo, sem zoom nem arrasto.
export const recorteCentralQuadrado = (largura: number, altura: number): Recorte =>
  recorteDe({ largura, altura, zoom: ZOOM_MINIMO, deslocX: 0, deslocY: 0 });
