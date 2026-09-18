const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export const formatMoney = (value: number | null | undefined): string =>
  typeof value === 'number' ? BRL.format(value) : '—';

export const formatDate = (value: string | null | undefined): string => {
  if (value === null || value === undefined || value.length === 0) {
    return '—';
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime())
    ? '—'
    : parsed.toLocaleDateString('pt-BR');
};

const FREQUENCY_LABEL: Record<string, string> = {
  day: 'dia',
  week: 'semana',
  month: 'mes',
  year: 'ano',
};

export const formatRecurrence = (
  frequency: string | null,
  interval: number | null,
): string => {
  if (frequency === null) {
    return 'Pagamento unico';
  }

  const unit = FREQUENCY_LABEL[frequency] ?? frequency;
  const every = interval ?? 1;

  return every === 1 ? `A cada ${unit}` : `A cada ${every} ${unit}s`;
};
