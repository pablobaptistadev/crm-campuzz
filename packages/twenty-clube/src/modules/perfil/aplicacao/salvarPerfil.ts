import { validarPerfil, type Perfil } from '../dominio/Perfil';
import { PerfilInvalido } from './erros';
import { type RepositorioDePerfil } from './portas';

export const salvarPerfil = async ({
  repositorio,
  membroId,
  perfil,
}: {
  repositorio: RepositorioDePerfil;
  membroId: string;
  perfil: Perfil;
}): Promise<Perfil> => {
  const problemas = validarPerfil(perfil);

  if (problemas.length > 0) {
    throw new PerfilInvalido(problemas);
  }

  // O CPF é guardado só com dígitos: a máscara é da tela, e duas grafias do
  // mesmo CPF viram dois valores diferentes na busca e na exportação.
  const limpo: Perfil = {
    ...perfil,
    nomeCompleto: perfil.nomeCompleto.trim().replace(/\s+/g, ' '),
    email: perfil.email.trim(),
    cpf:
      perfil.cpf === null || perfil.cpf.trim() === ''
        ? null
        : perfil.cpf.replace(/\D/g, ''),
  };

  await repositorio.salvar(membroId, limpo);

  return limpo;
};
