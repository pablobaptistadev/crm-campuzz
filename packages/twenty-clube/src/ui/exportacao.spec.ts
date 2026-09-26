import { describe, expect, it } from 'vitest';

import { type CampoMeta, type ObjetoMeta } from 'src/api/metadata';
import { gerarCsv } from 'src/ui/csv';
import { colunasDoCadastro } from 'src/ui/exportacao';

const campo = (name: string, type: CampoMeta['type'], label: string, extra: Partial<CampoMeta> = {}): CampoMeta => ({
  name,
  type,
  label,
  isSystem: false,
  isNullable: true,
  options: null,
  ...extra,
});

const OBJETO: ObjetoMeta = {
  nameSingular: 'membro',
  namePlural: 'membros',
  labelSingular: 'Membro',
  campoPorNome: new Map(
    [
      campo('zeta', 'TEXT', 'Zeta'),
      campo('situacao', 'SELECT', 'Status', {
        options: [
          { value: 'ATIVO', label: 'Ativo' },
          { value: 'INATIVO', label: 'Inativo' },
        ],
      }),
      campo('name', 'TEXT', 'Name'),
      campo('valorTotal', 'CURRENCY', 'Valor total'),
      campo('nascimento', 'DATE', 'Nascimento'),
      campo('placaEntregue', 'BOOLEAN', 'Placa entregue'),
      campo('endereco', 'ADDRESS', 'Endereço'),
      campo('telefones', 'PHONES', 'Telefone'),
      campo('clube', 'RELATION', 'Clube'),
      campo('createdBy', 'ACTOR', 'Criado por'),
      campo('interno', 'TEXT', 'Interno', { isSystem: true }),
      campo('alfa', 'TEXT', 'Alfa'),
    ].map((item) => [item.name, item]),
  ),
};

const GRUPOS = [
  { titulo: 'Documentos', campos: ['nascimento', { nome: 'situacao', rotulo: 'Status do membro' }] },
  { titulo: 'Contrato', campos: ['valorTotal', 'naoExiste'] },
];

describe('colunas da exportação', () => {
  const colunas = colunasDoCadastro(OBJETO, GRUPOS);

  it('segue a ordem da tela e põe o resto em ordem alfabética', () => {
    expect(colunas.map((coluna) => coluna.titulo)).toEqual([
      'Nome',
      'Nascimento',
      'Status do membro',
      'Valor total (R$)',
      'Alfa',
      'Endereço – rua',
      'Endereço – complemento',
      'Endereço – cidade',
      'Endereço – estado',
      'Endereço – CEP',
      'Endereço – país',
      'Placa entregue',
      'Telefone',
      'Zeta',
    ]);
  });

  it('deixa relação, autor e campo de sistema de fora', () => {
    const titulos = colunas.map((coluna) => coluna.titulo);

    expect(titulos).not.toContain('Clube');
    expect(titulos).not.toContain('Criado por');
    expect(titulos).not.toContain('Interno');
  });

  it('escreve o valor como a planilha entende', () => {
    const csv = gerarCsv(colunas, [
      {
        name: 'Ana',
        nascimento: '0001-07-21',
        situacao: 'ATIVO',
        valorTotal: { amountMicros: 7_500_500_000, currencyCode: 'BRL' },
        alfa: '=1+1',
        endereco: { addressStreet1: 'Rua A; 10', addressCity: 'São Paulo', addressPostcode: '01000-000' },
        placaEntregue: false,
        telefones: { primaryPhoneNumber: '11999999999', primaryPhoneCallingCode: '+55' },
        zeta: null,
      },
    ]);
    const [, linha] = csv.replace('﻿', '').split('\r\n');

    // O telefone também ganha o apóstrofo: "+55 11…" o Excel lê como conta e
    // mostra erro no lugar do número.
    expect(linha).toBe(
      "Ana;21/07/0001;Ativo;7500,50;'=1+1;\"Rua A; 10\";;São Paulo;;01000-000;;Não;'+55 11999999999;",
    );
  });
});
