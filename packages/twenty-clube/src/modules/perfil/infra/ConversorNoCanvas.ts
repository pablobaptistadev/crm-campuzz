import {
  FORMATO_DA_FOTO,
  QUALIDADE_DA_FOTO,
  type Recorte,
  deveConverterParaWebp,
  nomeEmWebp,
  recorteCentralQuadrado,
} from '../dominio/FotoDePerfil';
import { type ConversorDeImagem } from '../aplicacao/portas';

const desenhar = (
  origem: ImageBitmap,
  largura: number,
  altura: number,
  recorte: { origemX: number; origemY: number; lado: number } | null,
): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');

  canvas.width = largura;
  canvas.height = altura;

  const pincel = canvas.getContext('2d');

  if (pincel === null) {
    throw new Error('Não conseguimos preparar a imagem neste navegador.');
  }

  pincel.imageSmoothingQuality = 'high';

  if (recorte === null) {
    pincel.drawImage(origem, 0, 0, largura, altura);
  } else {
    pincel.drawImage(
      origem,
      recorte.origemX,
      recorte.origemY,
      recorte.lado,
      recorte.lado,
      0,
      0,
      largura,
      altura,
    );
  }

  return canvas;
};

const paraBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolver, rejeitar) => {
    canvas.toBlob(
      (blob) =>
        blob === null
          ? rejeitar(new Error('Não conseguimos converter a imagem.'))
          : resolver(blob),
      FORMATO_DA_FOTO,
      QUALIDADE_DA_FOTO,
    );
  });

export const criarConversorNoCanvas = (): ConversorDeImagem => ({
  async paraWebp(arquivo, ladoMaximo, recorteEscolhido) {
    const precisaRecortar = ladoMaximo !== undefined;

    if (!precisaRecortar && !deveConverterParaWebp(arquivo.type)) {
      return arquivo;
    }

    const origem = await createImageBitmap(arquivo);

    try {
      // Sem recorte escolhido cai no centro: é o que vale para quem confirmou
      // sem mexer, e para quem chama sem passar por tela nenhuma.
      const canvas = precisaRecortar
        ? desenhar(
            origem,
            ladoMaximo,
            ladoMaximo,
            recorteEscolhido ?? recorteCentralQuadrado(origem.width, origem.height),
          )
        : desenhar(origem, origem.width, origem.height, null);

      const blob = await paraBlob(canvas);

      return new File([blob], nomeEmWebp(arquivo.name), {
        type: FORMATO_DA_FOTO,
        lastModified: Date.now(),
      });
    } finally {
      // O bitmap segura memória de imagem fora do heap do JS e o coletor não
      // a alcança; sem fechar, subir dez fotos grandes derruba a aba.
      origem.close();
    }
  },
});
