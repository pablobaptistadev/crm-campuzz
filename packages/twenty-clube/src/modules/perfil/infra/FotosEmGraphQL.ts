import { gql } from 'src/api/client';

import { type RepositorioDeFoto } from '../aplicacao/portas';

// Cada dono guarda a foto na sua coluna: o membro e o clube em `fotoUrl`, o
// usuário da conta em `avatarUrl`, que é o nome que o Twenty já usava. Mapear
// aqui evita espalhar `if dono === 'clube'` pela tela.
const MUTACAO: Record<string, { nome: string; entrada: string; coluna: string }> = {
  membro: { nome: 'updateMembro', entrada: 'MembroUpdateInput', coluna: 'fotoUrl' },
  clube: { nome: 'updateClube', entrada: 'ClubeUpdateInput', coluna: 'fotoUrl' },
  usuario: {
    nome: 'updateWorkspaceMember',
    entrada: 'WorkspaceMemberUpdateInput',
    coluna: 'avatarUrl',
  },
};

export type DonoDaFoto = keyof typeof MUTACAO;

export const criarRepositorioDeFoto = (dono: DonoDaFoto): RepositorioDeFoto => {
  const alvo = MUTACAO[dono];

  if (alvo === undefined) {
    throw new Error(`Não sabemos onde guardar a foto de "${dono}".`);
  }

  return {
    async salvarFoto(id, url) {
      await gql(
        `mutation TrocarFoto($id: UUID!, $data: ${alvo.entrada}!) {
           ${alvo.nome}(id: $id, data: $data) { id }
         }`,
        { id, data: { [alvo.coluna]: url } },
      );
    },
  };
};
