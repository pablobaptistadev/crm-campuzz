// Raiz de composição: é aqui, e só aqui, que o módulo escolhe implementações.
// Trocar canvas por outro conversor, ou GraphQL por REST, muda este arquivo e
// mais nenhum — o domínio e os casos de uso não sabem o que existe do lado de
// fora.
import { enviarAnexo } from './aplicacao/enviarAnexo';
import { enviarFotoDePerfil } from './aplicacao/enviarFotoDePerfil';
import { removerFotoDePerfil } from './aplicacao/removerFotoDePerfil';
import { salvarPerfil } from './aplicacao/salvarPerfil';
import { criarArmazenamentoDoWorker, criarRegistroDeAnexo } from './infra/ArquivosDoWorker';
import { criarConversorNoCanvas } from './infra/ConversorNoCanvas';
import { criarRepositorioDePerfil } from './infra/PerfilEmGraphQL';
import { type Perfil } from './dominio/Perfil';

const conversor = criarConversorNoCanvas();
const armazenamento = criarArmazenamentoDoWorker();
const registro = criarRegistroDeAnexo();
const repositorio = criarRepositorioDePerfil();

export const perfilDoMembro = {
  salvar: (membroId: string, perfil: Perfil) =>
    salvarPerfil({ repositorio, membroId, perfil }),

  trocarFoto: (membroId: string, arquivo: File) =>
    enviarFotoDePerfil({ conversor, armazenamento, repositorio, membroId, arquivo }),

  removerFoto: (membroId: string) => removerFotoDePerfil({ repositorio, membroId }),

  anexar: (arquivo: File, campoAlvo: string, alvoId: string) =>
    enviarAnexo({ conversor, armazenamento, registro, arquivo, campoAlvo, alvoId }),
};

export { PerfilInvalido } from './aplicacao/erros';
export { formatarCpf, validarPerfil, type Perfil, type Problema } from './dominio/Perfil';
export { LADO_DA_FOTO } from './dominio/FotoDePerfil';
