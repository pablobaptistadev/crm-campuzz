import { describe, expect, it } from 'vitest';

import {
  LADO_DA_FOTO,
  ZOOM_MAXIMO,
  ZOOM_MINIMO,
  deveConverterParaWebp,
  limitarZoom,
  nomeEmWebp,
  recorteCentralQuadrado,
  recorteDe,
} from './FotoDePerfil';

describe('foto de perfil', () => {
  it('fica em 400x400', () => {
    expect(LADO_DA_FOTO).toBe(400);
  });

  // Esticar deformaria o rosto, que é o que a foto existe para mostrar.
  it('recorta pelo centro em vez de esticar', () => {
    expect(recorteCentralQuadrado(1000, 600)).toEqual({ origemX: 200, origemY: 0, lado: 600 });
    expect(recorteCentralQuadrado(600, 1000)).toEqual({ origemX: 0, origemY: 200, lado: 600 });
    expect(recorteCentralQuadrado(800, 800)).toEqual({ origemX: 0, origemY: 0, lado: 800 });
  });

  it('arredonda a origem para pixel inteiro', () => {
    expect(recorteCentralQuadrado(101, 100).origemX).toBe(1);
  });
});

describe('quando converter para webp', () => {
  it('converte os formatos comuns de câmera e print', () => {
    for (const tipo of ['image/png', 'image/jpeg', 'image/heic', 'image/avif']) {
      expect(deveConverterParaWebp(tipo)).toBe(true);
    }
  });

  it('não reprocessa o que já é webp', () => {
    expect(deveConverterParaWebp('image/webp')).toBe(false);
  });

  // SVG vira script no domínio do CRM e o canvas o rasterizaria; GIF perderia
  // a animação. Os dois sobem como vieram.
  it('deixa svg e gif em paz', () => {
    expect(deveConverterParaWebp('image/svg+xml')).toBe(false);
    expect(deveConverterParaWebp('image/gif')).toBe(false);
  });

  it('não toca no que não é imagem', () => {
    for (const tipo of ['application/pdf', 'text/csv', 'application/zip']) {
      expect(deveConverterParaWebp(tipo)).toBe(false);
    }
  });
});

describe('nome do arquivo convertido', () => {
  it('troca a extensão', () => {
    expect(nomeEmWebp('retrato.JPG')).toBe('retrato.webp');
    expect(nomeEmWebp('foto.de.perfil.png')).toBe('foto.de.perfil.webp');
  });

  it('lida com nome sem extensão e com nome que é só extensão', () => {
    expect(nomeEmWebp('retrato')).toBe('retrato.webp');
    expect(nomeEmWebp('.perfil')).toBe('imagem.webp');
  });
});

describe('recorte escolhido à mão', () => {
  const retrato = { largura: 600, altura: 1000 };

  it('sem zoom nem arrasto é o mesmo do recorte central', () => {
    expect(recorteDe({ ...retrato, zoom: 1, deslocX: 0, deslocY: 0 })).toEqual(
      recorteCentralQuadrado(retrato.largura, retrato.altura),
    );
  });

  it('zoom 2 pega metade do lado', () => {
    expect(recorteDe({ ...retrato, zoom: 2, deslocX: 0, deslocY: 0 }).lado).toBe(300);
  });

  it('arrastar move a origem', () => {
    const centro = recorteDe({ ...retrato, zoom: 2, deslocX: 0, deslocY: 0 });
    const acima = recorteDe({ ...retrato, zoom: 2, deslocX: 0, deslocY: -100 });

    expect(acima.origemY).toBe(centro.origemY - 100);
  });

  // Faixa vazia na foto é pior que recorte apertado: o arrasto para na borda.
  it('não deixa o recorte sair da imagem', () => {
    const longe = recorteDe({ ...retrato, zoom: 2, deslocX: -9999, deslocY: 9999 });

    expect(longe.origemX).toBe(0);
    expect(longe.origemY).toBe(retrato.altura - longe.lado);
  });

  it('o recorte cabe na imagem em qualquer zoom e arrasto', () => {
    for (const zoom of [1, 1.7, 2.5, 4, 99]) {
      for (const desloc of [-5000, -300, 0, 300, 5000]) {
        const r = recorteDe({ ...retrato, zoom, deslocX: desloc, deslocY: desloc });

        expect(r.origemX).toBeGreaterThanOrEqual(0);
        expect(r.origemY).toBeGreaterThanOrEqual(0);
        expect(r.origemX + r.lado).toBeLessThanOrEqual(retrato.largura);
        expect(r.origemY + r.lado).toBeLessThanOrEqual(retrato.altura);
      }
    }
  });

  it('prende o zoom na faixa útil', () => {
    expect(limitarZoom(0.2)).toBe(ZOOM_MINIMO);
    expect(limitarZoom(50)).toBe(ZOOM_MAXIMO);
    expect(limitarZoom(Number.NaN)).toBe(ZOOM_MINIMO);
  });
});
