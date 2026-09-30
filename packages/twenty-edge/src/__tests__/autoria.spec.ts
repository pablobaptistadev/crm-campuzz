import { describe, expect, it } from 'vitest';

import { type FlatObjectMetadata } from 'src/metadata/types';
import { buildUpsertQuery, flattenRecordInput } from 'src/orm/mutations';
import { buildWorkspaceTableShape } from 'src/orm/table-shape';
import { type Autor, carimbarAutoria } from 'src/services/autoria';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';

const objeto = (
  nameSingular: string,
  campos: readonly (readonly [string, string])[],
): FlatObjectMetadata => ({
  id: `object-${nameSingular}`,
  workspaceId: WORKSPACE_ID,
  nameSingular,
  namePlural: `${nameSingular}s`,
  labelSingular: nameSingular,
  labelPlural: nameSingular,
  description: null,
  icon: null,
  isActive: true,
  isSystem: false,
  isCustom: false,
  isSearchable: false,
  labelIdentifierFieldMetadataId: null,
  duplicateCriteria: null,
  imageIdentifierFieldMetadataId: null,
  fields: campos.map(([name, type]) => ({
    id: `field-${nameSingular}-${name}`,
    objectMetadataId: `object-${nameSingular}`,
    workspaceId: WORKSPACE_ID,
    name,
    label: name,
    type: type as never,
    description: null,
    icon: null,
    isActive: true,
    isSystem: false,
    isNullable: true,
    isUnique: false,
    defaultValue: null,
    options: null,
    settings: null,
    relationTargetFieldMetadataId: null,
    relationTargetObjectMetadataId: null,
  })),
});

const formaDe = (object: FlatObjectMetadata) =>
  buildWorkspaceTableShape({ object, workspaceId: WORKSPACE_ID } as never);

const membro = formaDe(
  objeto('membro', [
    ['id', 'UUID'],
    ['name', 'TEXT'],
    ['createdBy', 'ACTOR'],
    ['createdAt', 'DATE_TIME'],
  ]),
);

const anotacao = formaDe(
  objeto('timelineActivity', [
    ['id', 'UUID'],
    ['name', 'TEXT'],
    ['workspaceMemberId', 'UUID'],
    ['createdBy', 'ACTOR'],
  ]),
);

const AUTOR: Autor = { workspaceMemberId: 'wm-thamirys', nome: 'Thamirys Francoise' };

describe('carimbo de autoria', () => {
  it('grava quem criou, a partir da sessão', () => {
    const colunas = flattenRecordInput({
      shape: membro,
      input: carimbarAutoria({
        shape: membro,
        nomeDoObjeto: 'membro',
        dados: { name: 'Ana' },
        autor: AUTOR,
        origem: 'MANUAL',
      }),
    });

    expect(colunas.createdByWorkspaceMemberId).toBe('wm-thamirys');
    expect(colunas.createdByName).toBe('Thamirys Francoise');
    expect(colunas.createdBySource).toBe('MANUAL');
  });

  // Era o buraco: 70 anotações escritas à mão, nenhuma com autor.
  it('põe o autor na anotação do histórico', () => {
    const colunas = flattenRecordInput({
      shape: anotacao,
      input: carimbarAutoria({
        shape: anotacao,
        nomeDoObjeto: 'timelineActivity',
        dados: { name: 'nota' },
        autor: AUTOR,
        origem: 'MANUAL',
      }),
    });

    expect(colunas.workspaceMemberId).toBe('wm-thamirys');
  });

  // Quem monta o corpo da requisição não pode assinar pelo colega.
  it('ignora um autor forjado pelo cliente', () => {
    const colunas = flattenRecordInput({
      shape: anotacao,
      input: carimbarAutoria({
        shape: anotacao,
        nomeDoObjeto: 'timelineActivity',
        dados: {
          name: 'nota',
          workspaceMemberId: 'wm-outra-pessoa',
          createdBy: { source: 'SYSTEM', name: 'Outra Pessoa' },
        },
        autor: AUTOR,
        origem: 'MANUAL',
      }),
    });

    expect(colunas.workspaceMemberId).toBe('wm-thamirys');
    expect(colunas.createdByName).toBe('Thamirys Francoise');
    expect(colunas.createdBySource).toBe('MANUAL');
  });

  it('só põe workspaceMemberId na anotação, não em qualquer objeto', () => {
    const dados = carimbarAutoria({
      shape: membro,
      nomeDoObjeto: 'membro',
      dados: { name: 'Ana' },
      autor: AUTOR,
      origem: 'MANUAL',
    });

    expect(dados).not.toHaveProperty('workspaceMemberId');
  });

  it('sem sessão não inventa autor', () => {
    const dados = { name: 'Ana' };

    expect(
      carimbarAutoria({ shape: membro, nomeDoObjeto: 'membro', dados, autor: null, origem: 'MANUAL' }),
    ).toBe(dados);
  });

  it('marca a importação como IMPORT', () => {
    const colunas = flattenRecordInput({
      shape: membro,
      input: carimbarAutoria({
        shape: membro,
        nomeDoObjeto: 'membro',
        dados: { name: 'Ana' },
        autor: AUTOR,
        origem: 'IMPORT',
      }),
    });

    expect(colunas.createdBySource).toBe('IMPORT');
  });
});

describe('upsert não troca quem criou', () => {
  // Reimportar um CSV cai em linhas que já existem. Sem isto, o criador
  // original seria trocado por quem só importou o arquivo de novo.
  it('não sobrescreve createdBy nem createdAt no conflito', () => {
    const { text: sql } = buildUpsertQuery({
      shape: membro,
      input: carimbarAutoria({
        shape: membro,
        nomeDoObjeto: 'membro',
        dados: { id: 'm1', name: 'Ana', createdAt: '2026-01-01' },
        autor: AUTOR,
        origem: 'IMPORT',
      }),
    });

    // Só o SET: o RETURNING devolve todas as colunas, e ler as de autoria de
    // volta é o comportamento certo.
    const atualizacao = sql.slice(sql.indexOf('DO UPDATE SET'), sql.indexOf('RETURNING'));

    expect(atualizacao).toContain('"name" = EXCLUDED."name"');
    expect(atualizacao).not.toContain('createdBy');
    expect(atualizacao).not.toContain('"createdAt"');
  });

  it('continua gravando o autor quando o upsert insere', () => {
    const { text: sql } = buildUpsertQuery({
      shape: membro,
      input: carimbarAutoria({
        shape: membro,
        nomeDoObjeto: 'membro',
        dados: { id: 'm1', name: 'Ana' },
        autor: AUTOR,
        origem: 'IMPORT',
      }),
    });

    const insercao = sql.slice(0, sql.indexOf('ON CONFLICT'));

    expect(insercao).toContain('"createdByWorkspaceMemberId"');
  });
});
