export const PERIODOS = [
  { value: 'MENSAL', label: 'Mensal', dias: 0, meses: 1 },
  { value: 'QUINZENAL', label: 'Quinzenal', dias: 15, meses: 0 },
  { value: 'SEMANAL', label: 'Semanal', dias: 7, meses: 0 },
  { value: 'ANUAL', label: 'Anual', dias: 0, meses: 12 },
];

// Somar mês em JavaScript estoura o fim do mês: 31/01 + 1 mês vira 03/03. Fixar
// no último dia do mês de destino é o que um boleto faz.
export const avancar = (base: string, periodo: string, vezes: number): string => {
  const definicao = PERIODOS.find((item) => item.value === periodo) ?? PERIODOS[0];
  const [ano, mes, dia] = base.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));

  if (definicao.meses > 0) {
    const totalMeses = mes - 1 + definicao.meses * vezes;
    const anoAlvo = ano + Math.floor(totalMeses / 12);
    const mesAlvo = totalMeses % 12;
    const ultimoDia = new Date(Date.UTC(anoAlvo, mesAlvo + 1, 0)).getUTCDate();

    data.setUTCFullYear(anoAlvo, mesAlvo, Math.min(dia, ultimoDia));
  } else {
    data.setUTCDate(data.getUTCDate() + definicao.dias * vezes);
  }

  return data.toISOString().slice(0, 10);
};

export const numeroLimpo = (bruto: string): number =>
  Number(bruto.replace(/\./g, '').replace(',', '.')) || 0;

export const micros = (valor: number) => ({
  amountMicros: Math.round(valor * 1_000_000),
  currencyCode: 'BRL',
});

export type ParcelaPrevia = { numero: number; valor: number; vencimento: string };

// O arredondamento vai todo na primeira parcela; assim a soma fecha com o valor
// do contrato em vez de sobrar centavo.
export const montarParcelas = ({
  valorTotal,
  entrada,
  quantidade,
  primeiroVencimento,
  periodicidade,
}: {
  valorTotal: string;
  entrada: string;
  quantidade: string;
  primeiroVencimento: string;
  periodicidade: string;
}): ParcelaPrevia[] => {
  const vezes = Math.max(0, Math.min(120, Number(quantidade) || 0));
  const restante = numeroLimpo(valorTotal) - numeroLimpo(entrada);

  if (vezes === 0 || restante <= 0 || primeiroVencimento === '') {
    return [];
  }

  const base = Math.floor((restante / vezes) * 100) / 100;
  const sobra = Math.round((restante - base * vezes) * 100) / 100;

  return Array.from({ length: vezes }, (_, indice) => ({
    numero: indice + 1,
    valor: indice === 0 ? Math.round((base + sobra) * 100) / 100 : base,
    vencimento: avancar(primeiroVencimento, periodicidade, indice),
  }));
};

export const dataLembrete = (vencimento: string, diasAntes: number): string => {
  if (diasAntes <= 0) {
    return vencimento;
  }

  return new Date(
    new Date(`${vencimento}T00:00:00Z`).getTime() - diasAntes * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);
};
