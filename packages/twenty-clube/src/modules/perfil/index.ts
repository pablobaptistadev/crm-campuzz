// Raiz de composição: é aqui, e só aqui, que o módulo escolhe implementações.
// Trocar canvas por outro conversor, ou GraphQL por REST, muda este arquivo e
// mais nenhum — o domínio e os casos de uso não sabem o que existe do lado de
// fora.
import { enviarAnexo } from './aplicacao/enviarAnexo';
import { enviarFoto, removerFoto } from './aplicacao/enviarFoto';
import { salvarPerfil } from './aplicacao/salvarPerfil';
import { criarArmazenamentoDoWorker, criarRegistroDeAnexo } from './infra/ArquivosDoWorker';
import { criarConversorNoCanvas } from './infra/ConversorNoCanvas';
import { criarRepositorioDePerfil } from './infra/PerfilEmGraphQL';
import { type DonoDaFoto, criarRepositorioDeFoto } from './infra/FotosEmGraphQL';
import { type Recorte } from './dominio/FotoDePerfil';
import { type Perfil } from './dominio/Perfil';

const conversor = criarConversorNoCanvas();
const armazenamento = criarArmazenamentoDoWorker();
const registro = criarRegistroDeAnexo();
const repositorio = criarRepositorioDePerfil();

export const perfilDoMembro = {
  salvar: (membroId: string, perfil: Perfil) =>
    salvarPerfil({ repositorio, membroId, perfil }),


  anexar: (arquivo: File, campoAlvo: string, alvoId: string) =>
    enviarAnexo({ conversor, armazenamento, registro, arquivo, campoAlvo, alvoId }),
};

// A foto de qualquer dono passa por aqui. O membro continua com o seu caso de
// uso próprio porque ele também salva nome, cpf e bio; clube e usuário só têm
// foto.
export const fotoDe = (dono: DonoDaFoto) => {
  const repositorioDaFoto = criarRepositorioDeFoto(dono);

  return {
    trocar: (donoId: string, arquivo: File, recorte?: Recorte) =>
      enviarFoto({
        conversor,
        armazenamento,
        repositorio: repositorioDaFoto,
        donoId,
        arquivo,
        recorte,
      }),
    remover: (donoId: string) =>
      removerFoto({ repositorio: repositorioDaFoto, donoId }),
  };
};

export { type DonoDaFoto } from './infra/FotosEmGraphQL';
export { type Recorte } from './dominio/FotoDePerfil';
export { RecortarFoto } from './ui/RecortarFoto';
export { PerfilInvalido } from './aplicacao/erros';
export { formatarCpf, validarPerfil, type Perfil, type Problema } from './dominio/Perfil';
export { LADO_DA_FOTO } from './dominio/FotoDePerfil';
