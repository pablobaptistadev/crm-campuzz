// Planilha para abrir no Excel em português: separador ponto e vírgula (a
// vírgula é o decimal), quebra de linha do Windows e BOM no começo — sem ele
// o Excel lê o arquivo como Latin-1 e "Educação" vira "EducaÃ§Ã£o".
const BOM = '﻿';
const SEPARADOR = ';';
const QUEBRA = '\r\n';

export type Celula = string | number | null | undefined;

export type Coluna<TLinha> = {
  titulo: string;
  valor: (linha: TLinha) => Celula;
};

// Texto que começa com = + - @ vira fórmula no Excel: um nome como
// "=HYPERLINK(...)" cadastrado por alguém executaria ao abrir a planilha. O
// apóstrofo no começo faz a célula ser lida como texto.
const COMECA_FORMULA = /^[=+\-@\t\r]/;

const escapar = (texto: string): string =>
  /[";\r\n]/.test(texto) || texto !== texto.trim() ? `"${texto.replace(/"/g, '""')}"` : texto;

// Número sai com vírgula e sem separador de milhar, que é o que o Excel em
// português reconhece como número — "7.500,00" viraria texto.
export const numeroBr = (numero: number): string =>
  Number.isInteger(numero) ? String(numero) : numero.toFixed(2).replace('.', ',');

export const celula = (valor: Celula): string => {
  if (valor === null || valor === undefined) {
    return '';
  }

  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? numeroBr(valor) : '';
  }

  return escapar(COMECA_FORMULA.test(valor) ? `'${valor}` : valor);
};

export const gerarCsv = <TLinha>(colunas: readonly Coluna<TLinha>[], linhas: readonly TLinha[]): string =>
  BOM +
  [
    colunas.map((coluna) => celula(coluna.titulo)).join(SEPARADOR),
    ...linhas.map((linha) => colunas.map((coluna) => celula(coluna.valor(linha))).join(SEPARADOR)),
  ].join(QUEBRA) +
  QUEBRA;

// dd/mm/aaaa, sem passar por Date(): a data do banco é 'AAAA-MM-DD' e o
// fuso do navegador a puxaria um dia para trás.
export const dataBr = (valor: string | null | undefined): string => {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(valor)) {
    return '';
  }

  const [ano, mes, dia] = valor.slice(0, 10).split('-');

  return `${dia}/${mes}/${ano}`;
};
