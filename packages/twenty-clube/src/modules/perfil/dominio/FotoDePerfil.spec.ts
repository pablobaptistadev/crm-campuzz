import { describe, expect, it } from 'vitest';

import {
  LADO_DA_FOTO,
  deveConverterParaWebp,
  nomeEmWebp,
  recorteCentralQuadrado,
} from './FotoDePerfil';

describe('foto de perfil', () => {
  it('fica em 300x300', () => {
    expect(LADO_DA_FOTO).toBe(300);
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
