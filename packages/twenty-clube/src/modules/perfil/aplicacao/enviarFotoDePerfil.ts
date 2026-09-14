import { LADO_DA_FOTO, ehImagem } from '../dominio/FotoDePerfil';
import {
  type ArmazenamentoDeArquivo,
  type ConversorDeImagem,
  type RepositorioDePerfil,
} from './portas';

export const enviarFotoDePerfil = async ({
  conversor,
  armazenamento,
  repositorio,
  membroId,
  arquivo,
}: {
  conversor: ConversorDeImagem;
  armazenamento: ArmazenamentoDeArquivo;
  repositorio: RepositorioDePerfil;
  membroId: string;
  arquivo: File;
}): Promise<string> => {
  if (!ehImagem(arquivo.type)) {
    throw new Error('A foto de perfil precisa ser uma imagem.');
  }

  const quadrada = await conversor.paraWebp(arquivo, LADO_DA_FOTO);
  const guardado = await armazenamento.guardar(quadrada);

  await repositorio.salvar(membroId, { fotoUrl: guardado.url });

  return guardado.url;
};
