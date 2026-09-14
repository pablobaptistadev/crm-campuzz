import { describe, expect, it, vi } from 'vitest';

import { LADO_DA_FOTO } from '../dominio/FotoDePerfil';
import { enviarAnexo } from './enviarAnexo';
import { enviarFotoDePerfil } from './enviarFotoDePerfil';

const arquivo = (nome: string, tipo: string) =>
  ({ name: nome, type: tipo, size: 10 }) as unknown as File;

const montar = () => {
  const convertidos: { nome: string; lado: number | undefined }[] = [];

  return {
    convertidos,
    conversor: {
      paraWebp: vi.fn(async (entrada: File, lado?: number) => {
        convertidos.push({ nome: entrada.name, lado });

        return arquivo(entrada.name.replace(/\.[^.]+$/, '.webp'), 'image/webp');
      }),
    },
    armazenamento: {
      guardar: vi.fn(async () => ({ fileId: 'f1', url: 'https://exemplo/f1.webp' })),
    },
    registro: { registrar: vi.fn(async () => ({ id: 'a1', name: 'x', fullPath: null, type: null })) },
    repositorio: { salvar: vi.fn(async () => undefined) },
  };
};

describe('anexo', () => {
  it('converte imagem para webp antes de subir', async () => {
    const { conversor, armazenamento, registro, convertidos } = montar();

    await enviarAnexo({
      conversor,
      armazenamento,
      registro,
      arquivo: arquivo('print.png', 'image/png'),
      campoAlvo: 'targetMembroId',
      alvoId: 'm1',
    });

    expect(convertidos).toEqual([{ nome: 'print.png', lado: undefined }]);
  });

  // Uma planta ou um contrato escaneado perderiam o que importa num quadrado.
  it('não recorta anexo, só a foto de perfil', async () => {
    const { conversor, armazenamento, registro, convertidos } = montar();

    await enviarAnexo({
      conversor,
      armazenamento,
      registro,
      arquivo: arquivo('planta.jpg', 'image/jpeg'),
      campoAlvo: 'targetMembroId',
      alvoId: 'm1',
    });

    expect(convertidos[0]?.lado).toBeUndefined();
  });

  it('não passa PDF pelo conversor', async () => {
    const { conversor, armazenamento, registro } = montar();

    await enviarAnexo({
      conversor,
      armazenamento,
      registro,
      arquivo: arquivo('contrato.pdf', 'application/pdf'),
      campoAlvo: 'targetMembroId',
      alvoId: 'm1',
    });

    expect(conversor.paraWebp).not.toHaveBeenCalled();
    expect(armazenamento.guardar).toHaveBeenCalled();
  });
});

describe('foto de perfil', () => {
  it('sempre pede 300x300', async () => {
    const { conversor, armazenamento, repositorio, convertidos } = montar();

    await enviarFotoDePerfil({
      conversor,
      armazenamento,
      repositorio,
      membroId: 'm1',
      arquivo: arquivo('retrato.jpg', 'image/jpeg'),
    });

    expect(convertidos[0]?.lado).toBe(LADO_DA_FOTO);
  });

  it('guarda a URL no membro', async () => {
    const { conversor, armazenamento, repositorio } = montar();

    await enviarFotoDePerfil({
      conversor,
      armazenamento,
      repositorio,
      membroId: 'm1',
      arquivo: arquivo('retrato.jpg', 'image/jpeg'),
    });

    expect(repositorio.salvar).toHaveBeenCalledWith('m1', {
      fotoUrl: 'https://exemplo/f1.webp',
    });
  });

  it('recusa um PDF como foto de perfil', async () => {
    const { conversor, armazenamento, repositorio } = montar();

    await expect(
      enviarFotoDePerfil({
        conversor,
        armazenamento,
        repositorio,
        membroId: 'm1',
        arquivo: arquivo('contrato.pdf', 'application/pdf'),
      }),
    ).rejects.toThrow(/imagem/);
  });
});
