const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const TRACO = '—';

export const texto = (valor: string | null | undefined): string =>
  valor !== null && valor !== undefined && valor.trim() !== '' ? valor : TRACO;

// A DATE column comes back as 'YYYY-MM-DD' and must not pass through Date():
// the parser reads it as UTC midnight and the local render slips a day back.
export const dataCurta = (valor: string | null | undefined): string => {
  if (valor === null || valor === undefined || valor === '') {
    return TRACO;
  }

  const [ano, mes, dia] = valor.slice(0, 10).split('-');

  if (ano === undefined || mes === undefined || dia === undefined) {
    return TRACO;
  }

  return `${dia}/${mes}/${ano}`;
};

export const dataLonga = (valor: string | null | undefined): string => {
  if (valor === null || valor === undefined || valor === '') {
    return TRACO;
  }

  const [ano, mes, dia] = valor.slice(0, 10).split('-');
  const indice = Number(mes) - 1;

  if (ano === undefined || dia === undefined || MESES[indice] === undefined) {
    return TRACO;
  }

  return `${dia} ${MESES[indice]} ${ano}`;
};

export const dataHora = (valor: string | null | undefined): string => {
  if (valor === null || valor === undefined || valor === '') {
    return TRACO;
  }

  const quando = new Date(valor);

  return Number.isNaN(quando.getTime())
    ? TRACO
    : quando.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

export const dinheiro = (
  valor: { amountMicros: number | null; currencyCode: string | null } | null | undefined,
): string => {
  const micros = valor?.amountMicros;

  if (micros === null || micros === undefined) {
    return TRACO;
  }

  return (Number(micros) / 1_000_000).toLocaleString('pt-BR', {
    style: 'currency',
    currency: valor?.currencyCode ?? 'BRL',
    maximumFractionDigits: 0,
  });
};

export const dinheiroCurto = (
  valor: { amountMicros: number | null; currencyCode: string | null } | null | undefined,
): string => {
  const micros = valor?.amountMicros;

  if (micros === null || micros === undefined || Number(micros) === 0) {
    return TRACO;
  }

  return `R$ ${(Number(micros) / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
};

export const telefone = (
  valor: { primaryPhoneNumber: string | null; primaryPhoneCallingCode: string | null } | null | undefined,
): string => {
  const numero = valor?.primaryPhoneNumber;

  if (numero === null || numero === undefined || numero === '') {
    return TRACO;
  }

  const codigo = valor?.primaryPhoneCallingCode ?? '';
  const digitos = numero.replace(/\D/g, '');

  if (digitos.length === 11) {
    return `${codigo} (${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`.trim();
  }

  if (digitos.length === 10) {
    return `${codigo} (${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`.trim();
  }

  return `${codigo} ${numero}`.trim();
};

export const iniciais = (nome: string): string =>
  nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte.charAt(0).toUpperCase())
    .join('');

export const enderecoLinha = (
  valor: {
    addressStreet1: string | null;
    addressStreet2: string | null;
    addressCity: string | null;
    addressState: string | null;
    addressPostcode: string | null;
    addressCountry: string | null;
  } | null | undefined,
): string => {
  const partes = [
    valor?.addressStreet1,
    valor?.addressStreet2,
    [valor?.addressCity, valor?.addressState].filter(Boolean).join(' - '),
    valor?.addressPostcode,
    valor?.addressCountry,
  ].filter((parte) => parte !== null && parte !== undefined && parte !== '');

  return partes.length > 0 ? partes.join(', ') : TRACO;
};
