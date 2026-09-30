import { gql } from 'src/api/client';

import { type Perfil } from '../dominio/Perfil';
import { type RepositorioDePerfil } from '../aplicacao/portas';

const ATUALIZAR = `
  mutation AtualizarPerfil($id: UUID!, $data: MembroUpdateInput!) {
    updateMembro(id: $id, data: $data) {
      id name cpf miniBio fotoUrl
      emails { primaryEmail }
    }
  }
`;

// A tradução entre o nome do domínio e o nome da coluna mora aqui, e só aqui:
// o domínio fala nomeCompleto e e-mail, o banco fala name e emails.
const paraColunas = (mudancas: Partial<Perfil>): Record<string, unknown> => {
  const dados: Record<string, unknown> = {};

  if (mudancas.nomeCompleto !== undefined) {
    dados.name = mudancas.nomeCompleto;
  }

  if (mudancas.email !== undefined) {
    dados.emails = { primaryEmail: mudancas.email, additionalEmails: [] };
  }

  if (mudancas.cpf !== undefined) {
    dados.cpf = mudancas.cpf;
  }

  if (mudancas.miniBio !== undefined) {
    dados.miniBio = mudancas.miniBio;
  }

  if (mudancas.fotoUrl !== undefined) {
    dados.fotoUrl = mudancas.fotoUrl;
  }

  return dados;
};

export const criarRepositorioDePerfil = (): RepositorioDePerfil => ({
  async salvar(id, mudancas) {
    const dados = paraColunas(mudancas);

    if (Object.keys(dados).length === 0) {
      return;
    }

    await gql(ATUALIZAR, { id, data: dados });
  },
});
