import { describe, expect, it, vi } from 'vitest';

import { type Perfil } from '../dominio/Perfil';
import { PerfilInvalido } from './erros';
import { salvarPerfil } from './salvarPerfil';

const base: Perfil = {
  nomeCompleto: 'Ana Paula Leal Pereira',
  email: 'ana@exemplo.com.br',
  cpf: null,
  miniBio: null,
  fotoUrl: null,
};

const repositorioFalso = () => {
  const salvos: { id: string; mudancas: Partial<Perfil> }[] = [];

  return {
    salvos,
    repositorio: { salvar: vi.fn(async (id: string, mudancas: Partial<Perfil>) => {
      salvos.push({ id, mudancas });
    }) },
  };
};

describe('salvar perfil', () => {
  it('não chega no banco quando o preenchimento está errado', async () => {
    const { repositorio } = repositorioFalso();

    await expect(
      salvarPerfil({ repositorio, membroId: 'm1', perfil: { ...base, email: '' } }),
    ).rejects.toBeInstanceOf(PerfilInvalido);

    expect(repositorio.salvar).not.toHaveBeenCalled();
  });

  it('diz qual campo está errado, para a tela apontar', async () => {
    const { repositorio } = repositorioFalso();

    await expect(
      salvarPerfil({ repositorio, membroId: 'm1', perfil: { ...base, cpf: '123' } }),
    ).rejects.toMatchObject({ problemas: [{ campo: 'cpf' }] });
  });

  // Duas grafias do mesmo CPF viram dois valores na busca e na exportação.
  it('guarda o CPF só com dígitos', async () => {
    const { salvos, repositorio } = repositorioFalso();

    await salvarPerfil({
      repositorio,
      membroId: 'm1',
      perfil: { ...base, cpf: '529.982.247-25' },
    });

    expect(salvos[0]?.mudancas.cpf).toBe('52998224725');
  });

  it('normaliza espaço sobrando no nome', async () => {
    const { salvos, repositorio } = repositorioFalso();

    await salvarPerfil({
      repositorio,
      membroId: 'm1',
      perfil: { ...base, nomeCompleto: '  Ana   Paula  Leal ' },
    });

    expect(salvos[0]?.mudancas.nomeCompleto).toBe('Ana Paula Leal');
  });

  it('grava CPF vazio como nulo, não como string vazia', async () => {
    const { salvos, repositorio } = repositorioFalso();

    await salvarPerfil({ repositorio, membroId: 'm1', perfil: { ...base, cpf: '   ' } });

    expect(salvos[0]?.mudancas.cpf).toBeNull();
  });
});
