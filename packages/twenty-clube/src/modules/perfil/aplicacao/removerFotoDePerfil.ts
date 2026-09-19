import { type RepositorioDePerfil } from './portas';

// Tirar a foto não passa pela validação do perfil inteiro: um membro cadastrado
// antes das regras novas pode estar sem e-mail, e isso não pode impedi-lo de
// remover uma foto errada.
export const removerFotoDePerfil = ({
  repositorio,
  membroId,
}: {
  repositorio: RepositorioDePerfil;
  membroId: string;
}): Promise<void> => repositorio.salvar(membroId, { fotoUrl: null });
