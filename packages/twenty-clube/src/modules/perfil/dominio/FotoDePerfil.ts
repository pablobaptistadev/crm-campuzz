// A especificação da foto vive no domínio porque é regra do produto, não
// detalhe de implementação: quem trocar canvas por outra coisa continua
// entregando 300x300 em webp.

export const LADO_DA_FOTO = 300;
export const FORMATO_DA_FOTO = 'image/webp';
export const EXTENSAO_DA_FOTO = 'webp';
export const QUALIDADE_DA_FOTO = 0.9;

// Imagens que não são quadradas viram quadradas pelo centro, não esticadas:
// esticar deforma o rosto, que é justamente o que a foto existe para mostrar.
export const recorteCentralQuadrado = (
  largura: number,
  altura: number,
): { origemX: number; origemY: number; lado: number } => {
  const lado = Math.min(largura, altura);

  return {
    origemX: Math.round((largura - lado) / 2),
    origemY: Math.round((altura - lado) / 2),
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
