import { type Client } from 'pg';

import { type Bindings } from 'src/env';
import { sendEmail, type EmailMessage } from 'src/services/email';
import { escapeIdentifier } from 'src/ddl/escape';
import { getWorkspaceSchemaName } from 'src/metadata/naming';

export type ResultadoLembretes = {
  workspaces: number;
  enviados: number;
  atrasadas: number;
  falhas: string[];
};

type ParcelaAviso = {
  id: string;
  nome: string;
  vencimento: string;
  valorMicros: string | null;
  email: string | null;
  membro: string | null;
  clube: string | null;
  workspaceName: string;
};

const dinheiro = (micros: string | null): string => {
  if (micros === null) {
    return '—';
  }

  return (Number(micros) / 1_000_000).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
};

const dataBr = (valor: string): string => {
  const [ano, mes, dia] = valor.slice(0, 10).split('-');

  return `${dia}/${mes}/${ano}`;
};

const escapar = (valor: string): string =>
  valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Primeira pessoa do plural: quem fala é o sistema, não uma pessoa.
export const montarEmailLembrete = (parcela: ParcelaAviso): EmailMessage => {
  const quem = parcela.membro ?? parcela.clube ?? 'Olá';
  const valor = dinheiro(parcela.valorMicros);
  const vence = dataBr(parcela.vencimento);
  const onde = parcela.clube === null ? '' : ` do ${parcela.clube}`;

  const texto = [
    `Olá, ${quem}.`,
    '',
    `Lembramos que a ${parcela.nome}${onde} vence em ${vence}, no valor de ${valor}.`,
    '',
    'Se o pagamento já saiu, pode ignorar este aviso.',
    '',
    parcela.workspaceName,
  ].join('\n');

  const html = `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#0f172a">
  <p>Olá, ${escapar(quem)}.</p>
  <p>Lembramos que a <strong>${escapar(parcela.nome)}</strong>${onde === '' ? '' : ` do ${escapar(parcela.clube as string)}`} vence em <strong>${vence}</strong>, no valor de <strong>${valor}</strong>.</p>
  <p style="color:#64748b">Se o pagamento já saiu, pode ignorar este aviso.</p>
  <p style="color:#64748b;font-size:13px">${escapar(parcela.workspaceName)}</p>
</div>`;

  return { to: parcela.email ?? '', subject: `${parcela.nome} vence em ${vence}`, text: texto, html };
};

// Um workspace só entra na varredura se tiver a tabela de parcelas: o objeto é
// customizado, então nem todo workspace do banco tem esse módulo.
const temParcelas = async (client: Client, schema: string): Promise<boolean> => {
  const { rows } = await client.query<{ existe: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = '_parcela'
     ) AS "existe"`,
    [schema],
  );

  return rows[0]?.existe === true;
};

export const varrerLembretes = async ({
  client,
  bindings,
  hoje = new Date().toISOString().slice(0, 10),
}: {
  client: Client;
  bindings: Bindings;
  hoje?: string;
}): Promise<ResultadoLembretes> => {
  const resultado: ResultadoLembretes = {
    workspaces: 0,
    enviados: 0,
    atrasadas: 0,
    falhas: [],
  };

  const { rows: workspaces } = await client.query<{ id: string; displayName: string }>(
    `SELECT "id", "displayName" FROM core."workspace" WHERE "deletedAt" IS NULL`,
  );

  for (const workspace of workspaces) {
    const schema = getWorkspaceSchemaName(workspace.id);

    if (!(await temParcelas(client, schema))) {
      continue;
    }

    resultado.workspaces += 1;

    const tabela = `${escapeIdentifier(schema)}.${escapeIdentifier('_parcela')}`;
    const membros = `${escapeIdentifier(schema)}.${escapeIdentifier('_membro')}`;
    const clubes = `${escapeIdentifier(schema)}.${escapeIdentifier('_clube')}`;

    // Vencida e ainda em aberto vira ATRASADA sozinha: é o que o painel usa
    // para pintar o clube em atraso sem ninguém clicar em nada.
    const atrasadas = await client.query(
      `UPDATE ${tabela}
       SET "situacao" = 'ATRASADA', "updatedAt" = now()
       WHERE "deletedAt" IS NULL
         AND "situacao" = 'PENDENTE'
         AND "vencimento" IS NOT NULL
         AND "vencimento" < $1::date`,
      [hoje],
    );

    resultado.atrasadas += atrasadas.rowCount ?? 0;

    const { rows: pendentes } = await client.query<{
      id: string;
      nome: string;
      vencimento: string;
      valorMicros: string | null;
      email: string | null;
      membro: string | null;
      clube: string | null;
    }>(
      `SELECT p."id",
              p."name" AS "nome",
              to_char(p."vencimento", 'YYYY-MM-DD') AS "vencimento",
              p."valorAmountMicros"::text AS "valorMicros",
              m."emailsPrimaryEmail" AS "email",
              m."name" AS "membro",
              c."name" AS "clube"
       FROM ${tabela} p
       LEFT JOIN ${membros} m ON m."id" = p."membroId" AND m."deletedAt" IS NULL
       LEFT JOIN ${clubes} c ON c."id" = p."clubeId" AND c."deletedAt" IS NULL
       WHERE p."deletedAt" IS NULL
         AND p."situacao" IN ('PENDENTE', 'ATRASADA')
         AND p."lembreteEm" IS NOT NULL
         AND p."lembreteEm" <= $1::date
         AND p."lembreteEnviadoEm" IS NULL
       ORDER BY p."vencimento"
       LIMIT 200`,
      [hoje],
    );

    for (const linha of pendentes) {
      if (linha.email === null || linha.email === '') {
        // Sem endereço não há o que enviar, mas marcamos assim mesmo: senão a
        // varredura de amanhã tenta a mesma linha para sempre.
        await client.query(
          `UPDATE ${tabela} SET "lembreteEnviadoEm" = now() WHERE "id" = $1`,
          [linha.id],
        );
        resultado.falhas.push(`${linha.nome}: membro sem e-mail`);
        continue;
      }

      const envio = await sendEmail({
        bindings,
        message: montarEmailLembrete({ ...linha, workspaceName: workspace.displayName }),
      });

      if (!envio.delivered) {
        resultado.falhas.push(`${linha.nome}: ${envio.reason}`);
        continue;
      }

      await client.query(
        `UPDATE ${tabela} SET "lembreteEnviadoEm" = now() WHERE "id" = $1`,
        [linha.id],
      );
      resultado.enviados += 1;
    }
  }

  return resultado;
};
