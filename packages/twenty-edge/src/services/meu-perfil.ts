import { type Client } from 'pg';

import { hashPassword, verifyPassword } from 'src/auth/password';
import { escapeIdentifier } from 'src/ddl/escape';
import { getWorkspaceSchemaName } from 'src/metadata/naming';

export const TAMANHO_MINIMO_DA_SENHA = 8;

export class ErroDoPerfil extends Error {}

const limpar = (valor: string): string => valor.replace(/\s+/g, ' ').trim();

/**
 * Troca o nome de quem está logado, e só dele.
 *
 * O nome mora em dois lugares: `core.user`, que é o que a barra do topo lê, e o
 * `workspaceMember`, que é o que o histórico mostra ao lado de cada linha.
 * Gravar só um deixaria a pessoa com um nome no topo e outro nas próprias
 * anotações — por isso os dois vão juntos, na mesma transação.
 */
export const atualizarMeuNome = async ({
  client,
  userId,
  workspaceId,
  primeiroNome,
  sobrenome,
}: {
  client: Client;
  userId: string;
  workspaceId: string | null;
  primeiroNome: string;
  sobrenome: string;
}): Promise<void> => {
  const primeiro = limpar(primeiroNome);
  const ultimo = limpar(sobrenome);

  if (primeiro === '') {
    throw new ErroDoPerfil('Informe o seu nome.');
  }

  if (primeiro.length > 80 || ultimo.length > 80) {
    throw new ErroDoPerfil('O nome pode ter no máximo 80 caracteres.');
  }

  await client.query('BEGIN');

  try {
    await client.query(
      `UPDATE core."user" SET "firstName" = $2, "lastName" = $3, "updatedAt" = now()
       WHERE "id" = $1`,
      [userId, primeiro, ultimo],
    );

    if (workspaceId !== null) {
      const schema = escapeIdentifier(getWorkspaceSchemaName(workspaceId));

      await client.query(
        `UPDATE ${schema}."workspaceMember"
         SET "nameFirstName" = $2, "nameLastName" = $3, "updatedAt" = now()
         WHERE "userId" = $1 AND "deletedAt" IS NULL`,
        [userId, primeiro, ultimo],
      );
    }

    await client.query('COMMIT');
  } catch (causa) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw causa;
  }
};

/**
 * Troca a senha de quem está logado, exigindo a atual.
 *
 * A senha atual é o que impede quem achou o computador destravado de trocar a
 * senha e trancar o dono do lado de fora. E as outras sessões caem: se a
 * troca é porque a senha vazou, quem a usou continuaria logado sem isso. A
 * sessão desta requisição fica, para a pessoa não ser deslogada no meio do
 * que acabou de fazer.
 */
export const trocarMinhaSenha = async ({
  client,
  userId,
  sessaoAtualId,
  senhaAtual,
  novaSenha,
}: {
  client: Client;
  userId: string;
  sessaoAtualId: string;
  senhaAtual: string;
  novaSenha: string;
}): Promise<{ sessoesEncerradas: number }> => {
  if (novaSenha.length < TAMANHO_MINIMO_DA_SENHA) {
    throw new ErroDoPerfil(
      `A nova senha precisa ter pelo menos ${TAMANHO_MINIMO_DA_SENHA} caracteres.`,
    );
  }

  if (novaSenha === senhaAtual) {
    throw new ErroDoPerfil('A nova senha precisa ser diferente da atual.');
  }

  const { rows } = await client.query<{ passwordHash: string | null }>(
    `SELECT "passwordHash" FROM core."user" WHERE "id" = $1`,
    [userId],
  );

  const guardada = rows[0]?.passwordHash ?? null;

  if (guardada === null || !(await verifyPassword(senhaAtual, guardada))) {
    throw new ErroDoPerfil('A senha atual não confere.');
  }

  await client.query('BEGIN');

  try {
    await client.query(
      `UPDATE core."user" SET "passwordHash" = $2, "updatedAt" = now() WHERE "id" = $1`,
      [userId, await hashPassword(novaSenha)],
    );

    const encerradas = await client.query(
      `UPDATE core."userSession"
       SET "revokedAt" = now(), "revokedReason" = 'PASSWORD_CHANGED'
       WHERE "userId" = $1 AND "id" <> $2 AND "revokedAt" IS NULL`,
      [userId, sessaoAtualId],
    );

    await client.query('COMMIT');

    return { sessoesEncerradas: encerradas.rowCount ?? 0 };
  } catch (causa) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw causa;
  }
};
