import { ehImagem } from '../dominio/FotoDePerfil';
import {
  type ArmazenamentoDeArquivo,
  type ConversorDeImagem,
  type RegistroDeAnexo,
} from './portas';

// Todo anexo passa pelo mesmo caminho; a diferença é que imagem vira webp
// antes de subir, e o resto sobe como está.
export const enviarAnexo = async ({
  conversor,
  armazenamento,
  registro,
  arquivo,
  campoAlvo,
  alvoId,
}: {
  conversor: ConversorDeImagem;
  armazenamento: ArmazenamentoDeArquivo;
  registro: RegistroDeAnexo;
  arquivo: File;
  campoAlvo: string;
  alvoId: string;
}) => {
  // Anexo não é recortado: uma planta, um print ou um contrato escaneado
  // perderiam justamente a parte que importa num quadrado de 300.
  const pronto = ehImagem(arquivo.type) ? await conversor.paraWebp(arquivo) : arquivo;
  const guardado = await armazenamento.guardar(pronto);

  return registro.registrar({ arquivo: pronto, guardado, campoAlvo, alvoId });
};
