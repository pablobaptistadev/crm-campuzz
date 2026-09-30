import { type Client } from 'pg';
import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from 'src/auth/password';
import {
  ErroDoPerfil,
  atualizarMeuNome,
  trocarMinhaSenha,
} from 'src/services/meu-perfil';

type Chamada = { sql: string; valores: unknown[] };

// Um client de mentira que só anota o que recebeu e responde o hash guardado.
const clienteFalso = (hashGuardado: string | null = null) => {
  const chamadas: Chamada[] = [];

  const client = {
    query: async (sql: string, valores: unknown[] = []) => {
      chamadas.push({ sql: sql.replace(/\s+/g, ' ').trim(), valores });

      if (sql.includes('SELECT "passwordHash"')) {
        return { rows: [{ passwordHash: hashGuardado }], rowCount: 1 };
      }

      if (sql.includes('"userSession"')) {
        return { rows: [], rowCount: 3 };
      }

      return { rows: [], rowCount: 1 };
    },
  } as unknown as Client;

  return { client, chamadas };
};

const gravacoes = (chamadas: Chamada[]) =>
  chamadas.filter((chamada) => /^UPDATE/.test(chamada.sql));

describe('trocar o próprio nome', () => {
  it('grava no usuário e no membro do workspace, na mesma transação', async () => {
    const { client, chamadas } = clienteFalso();

    await atualizarMeuNome({
      client,
      userId: 'u1',
      workspaceId: 'e3332ba1-91f3-4d90-ac84-e8ee8d2595a9',
      primeiroNome: '  Thamirys ',
      sobrenome: ' Françoise  Silva ',
    });

    const sqls = chamadas.map((chamada) => chamada.sql);

    expect(sqls[0]).toBe('BEGIN');
    expect(sqls.at(-1)).toBe('COMMIT');
    expect(sqls.some((sql) => sql.includes('core."user"'))).toBe(true);
    expect(sqls.some((sql) => sql.includes('"workspaceMember"'))).toBe(true);
    // Espaço sobrando vira um só: é assim que o nome aparece no histórico.
    expect(gravacoes(chamadas)[0]?.valores).toEqual(['u1', 'Thamirys', 'Françoise Silva']);
  });

  it('recusa nome em branco sem tocar no banco', async () => {
    const { client, chamadas } = clienteFalso();

    await expect(
      atualizarMeuNome({ client, userId: 'u1', workspaceId: null, primeiroNome: '   ', sobrenome: 'X' }),
    ).rejects.toBeInstanceOf(ErroDoPerfil);
    expect(chamadas).toHaveLength(0);
  });
});

describe('trocar a própria senha', () => {
  it('troca, e a nova senha passa a valer', async () => {
    const { client, chamadas } = clienteFalso(await hashPassword('senha-antiga-1'));

    await trocarMinhaSenha({
      client,
      userId: 'u1',
      sessaoAtualId: 's-atual',
      senhaAtual: 'senha-antiga-1',
      novaSenha: 'senha-nova-22',
    });

    const novoHash = gravacoes(chamadas).find((chamada) => chamada.sql.includes('"passwordHash"'))
      ?.valores[1] as string;

    expect(await verifyPassword('senha-nova-22', novoHash)).toBe(true);
    expect(await verifyPassword('senha-antiga-1', novoHash)).toBe(false);
  });

  // Se a troca é porque a senha vazou, quem a usou não pode continuar logado.
  it('derruba as outras sessões e mantém a atual', async () => {
    const { client, chamadas } = clienteFalso(await hashPassword('senha-antiga-1'));

    const { sessoesEncerradas } = await trocarMinhaSenha({
      client,
      userId: 'u1',
      sessaoAtualId: 's-atual',
      senhaAtual: 'senha-antiga-1',
      novaSenha: 'senha-nova-22',
    });

    const revogacao = gravacoes(chamadas).find((chamada) => chamada.sql.includes('"userSession"'));

    expect(revogacao?.sql).toContain('"id" <> $2');
    expect(revogacao?.valores).toEqual(['u1', 's-atual']);
    expect(sessoesEncerradas).toBe(3);
  });

  it('senha atual errada não grava nada', async () => {
    const { client, chamadas } = clienteFalso(await hashPassword('senha-antiga-1'));

    await expect(
      trocarMinhaSenha({
        client,
        userId: 'u1',
        sessaoAtualId: 's-atual',
        senhaAtual: 'chute-errado',
        novaSenha: 'senha-nova-22',
      }),
    ).rejects.toThrow('A senha atual não confere.');
    expect(gravacoes(chamadas)).toHaveLength(0);
  });

  it('recusa senha curta antes de conferir qualquer coisa', async () => {
    const { client, chamadas } = clienteFalso(await hashPassword('senha-antiga-1'));

    await expect(
      trocarMinhaSenha({ client, userId: 'u1', sessaoAtualId: 's', senhaAtual: 'senha-antiga-1', novaSenha: '1234567' }),
    ).rejects.toThrow('pelo menos 8');
    expect(chamadas).toHaveLength(0);
  });

  it('recusa repetir a senha atual', async () => {
    const { client } = clienteFalso(await hashPassword('senha-antiga-1'));

    await expect(
      trocarMinhaSenha({ client, userId: 'u1', sessaoAtualId: 's', senhaAtual: 'senha-antiga-1', novaSenha: 'senha-antiga-1' }),
    ).rejects.toThrow('diferente da atual');
  });

  it('conta sem senha (entrou por convite sem definir) não troca', async () => {
    const { client, chamadas } = clienteFalso(null);

    await expect(
      trocarMinhaSenha({ client, userId: 'u1', sessaoAtualId: 's', senhaAtual: 'qualquer-uma', novaSenha: 'senha-nova-22' }),
    ).rejects.toThrow('não confere');
    expect(gravacoes(chamadas)).toHaveLength(0);
  });
});
