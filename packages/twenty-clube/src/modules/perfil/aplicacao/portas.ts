import { type Recorte } from '../dominio/FotoDePerfil';
import { type Perfil } from '../dominio/Perfil';

// As portas são o contrato que a aplicação exige do mundo. Quem implementa
// está na infra; quem depende delas nunca sabe se é GraphQL, canvas ou R2.

export type ArquivoGuardado = { fileId: string; url: string };

export type ConversorDeImagem = {
  // Devolve o mesmo arquivo quando não há o que converter — quem chama não
  // precisa decidir se converte.
  paraWebp(
    arquivo: File,
    ladoMaximo?: number,
    recorte?: Recorte,
  ): Promise<File>;
};

export type ArmazenamentoDeArquivo = {
  guardar(arquivo: File): Promise<ArquivoGuardado>;
};

export type RegistroDeAnexo = {
  registrar(entrada: {
    arquivo: File;
    guardado: ArquivoGuardado;
    campoAlvo: string;
    alvoId: string;
  }): Promise<{ id: string; name: string; fullPath: string | null; type: string | null }>;
};

export type RepositorioDePerfil = {
  salvar(id: string, mudancas: Partial<Perfil>): Promise<void>;
};

// Clube e usuário da conta não têm perfil — têm uma foto e mais nada. Uma porta
// só para isso evita inventar um "perfil de clube" que ninguém pediu.
export type RepositorioDeFoto = {
  salvarFoto(id: string, url: string | null): Promise<void>;
};
