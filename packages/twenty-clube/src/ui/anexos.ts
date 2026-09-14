import { perfilDoMembro } from 'src/modules/perfil';

export type Anexo = {
  id: string;
  name: string;
  fullPath: string | null;
  type: string | null;
};

// O caminho do anexo mudou de casa: agora é um caso de uso do módulo de perfil,
// que converte imagem para webp antes de subir. Esta função continua existindo
// porque é o nome que as telas já chamam.
export const subirAnexo = ({
  arquivo,
  campoAlvo,
  alvoId,
}: {
  arquivo: File;
  campoAlvo: string;
  alvoId: string;
}): Promise<Anexo> => perfilDoMembro.anexar(arquivo, campoAlvo, alvoId);
