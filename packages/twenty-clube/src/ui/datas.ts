// A equipe trabalha no horário de Brasília. `toISOString()` devolve a data em
// UTC, que depois das 21h já é amanhã — e uma parcela que vence hoje virava
// atraso três horas antes da hora.
const DIA_EM_SAO_PAULO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const hojeLocal = (agora: Date = new Date()): string =>
  DIA_EM_SAO_PAULO.format(agora);

// Datas 'AAAA-MM-DD' contadas em dias inteiros, sem fuso no meio: as duas são
// lidas como meia-noite UTC, então a diferença nunca cai numa troca de horário.
export const diasEntre = (de: string, ate: string): number =>
  Math.round(
    (Date.parse(`${ate.slice(0, 10)}T00:00:00Z`) -
      Date.parse(`${de.slice(0, 10)}T00:00:00Z`)) /
      86_400_000,
  );

// Soma dias a uma data 'AAAA-MM-DD' e devolve no mesmo formato.
export const somarDias = (data: string, dias: number): string => {
  const base = new Date(`${data.slice(0, 10)}T00:00:00Z`);

  base.setUTCDate(base.getUTCDate() + dias);

  return base.toISOString().slice(0, 10);
};
