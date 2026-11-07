import { LADO_DA_FOTO, type Recorte, ehImagem } from '../dominio/FotoDePerfil';
import {
  type ArmazenamentoDeArquivo,
  type ConversorDeImagem,
  type RepositorioDeFoto,
} from './portas';

/**
 * Sobe uma foto para qualquer dono: membro, clube ou usuário da conta.
 *
 * O caso de uso é um só porque a regra é uma só — vira quadrado no recorte
 * pedido, vai para 400x400 webp e o endereço fica guardado. Quem muda de um
 * dono para o outro é o repositório, que sabe em qual coluna gravar.
 */
export const enviarFoto = async ({
  conversor,
  armazenamento,
  repositorio,
  donoId,
  arquivo,
  recorte,
}: {
  conversor: ConversorDeImagem;
  armazenamento: ArmazenamentoDeArquivo;
  repositorio: RepositorioDeFoto;
  donoId: string;
  arquivo: File;
  recorte?: Recorte;
}): Promise<string> => {
  if (!ehImagem(arquivo.type)) {
    throw new Error('A foto precisa ser uma imagem.');
  }

  const quadrada = await conversor.paraWebp(arquivo, LADO_DA_FOTO, recorte);
  const guardado = await armazenamento.guardar(quadrada);

  await repositorio.salvarFoto(donoId, guardado.url);

  return guardado.url;
};

export const removerFoto = async ({
  repositorio,
  donoId,
}: {
  repositorio: RepositorioDeFoto;
  donoId: string;
}): Promise<void> => {
  await repositorio.salvarFoto(donoId, null);
};
