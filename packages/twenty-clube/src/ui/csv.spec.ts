import { describe, expect, it } from 'vitest';

import { celula, dataBr, gerarCsv, numeroBr } from 'src/ui/csv';

describe('planilha em CSV', () => {
  it('começa com BOM, separa com ponto e vírgula e quebra linha do Windows', () => {
    const csv = gerarCsv(
      [
        { titulo: 'Nome', valor: (linha: { nome: string; valor: number }) => linha.nome },
        { titulo: 'Valor (R$)', valor: (linha) => linha.valor },
      ],
      [
        { nome: 'Educação', valor: 7500 },
        { nome: 'Ana', valor: 1234.5 },
      ],
    );

    expect(csv).toBe('﻿Nome;Valor (R$)\r\nEducação;7500\r\nAna;1234,50\r\n');
  });

  it('põe entre aspas o texto com ponto e vírgula, aspas ou quebra de linha', () => {
    expect(celula('a;b')).toBe('"a;b"');
    expect(celula('diz "oi"')).toBe('"diz ""oi"""');
    expect(celula('linha 1\nlinha 2')).toBe('"linha 1\nlinha 2"');
    expect(celula(' espaço ')).toBe('" espaço "');
    expect(celula('simples')).toBe('simples');
  });

  it('não deixa texto virar fórmula no Excel', () => {
    expect(celula('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(celula('+5511999999999')).toBe("'+5511999999999");
    expect(celula('-teste')).toBe("'-teste");
    expect(celula('@menção')).toBe("'@menção");
  });

  it('escreve número com vírgula e sem milhar, e deixa o negativo como número', () => {
    expect(numeroBr(7500)).toBe('7500');
    expect(numeroBr(7500.5)).toBe('7500,50');
    expect(celula(-120.25)).toBe('-120,25');
    expect(celula(Number.NaN)).toBe('');
  });

  it('deixa vazio o que não tem valor', () => {
    expect(celula(null)).toBe('');
    expect(celula(undefined)).toBe('');
  });

  it('escreve data como dd/mm/aaaa sem escorregar de dia', () => {
    expect(dataBr('2026-09-01')).toBe('01/09/2026');
    expect(dataBr('2026-09-01T02:00:00.000Z')).toBe('01/09/2026');
    expect(dataBr(null)).toBe('');
    expect(dataBr('ontem')).toBe('');
  });
});
