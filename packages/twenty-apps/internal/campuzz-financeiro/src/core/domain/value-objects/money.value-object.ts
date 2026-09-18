/**
 * Dinheiro em micros, que e como o Twenty guarda CURRENCY.
 *
 * A Routerfy manda `amount` como numero decimal em reais. Converter na fronteira
 * e guardar micros internamente evita que soma de parcela acumule erro de ponto
 * flutuante: 0.1 + 0.2 em reais nao fecha, 100000 + 200000 em micros fecha.
 */
export type Money = {
  amountMicros: number;
  currencyCode: string;
};

export const DEFAULT_CURRENCY_CODE = 'BRL';

const MICROS_PER_UNIT = 1_000_000;

export const moneyFromUnits = (
  amount: number,
  currencyCode: string = DEFAULT_CURRENCY_CODE,
): Money => ({
  amountMicros: Math.round(amount * MICROS_PER_UNIT),
  currencyCode,
});

export const moneyToUnits = (money: Money): number =>
  money.amountMicros / MICROS_PER_UNIT;

export const sumMoney = (
  values: readonly Money[],
  currencyCode: string = DEFAULT_CURRENCY_CODE,
): Money => ({
  amountMicros: values.reduce((total, value) => total + value.amountMicros, 0),
  currencyCode: values[0]?.currencyCode ?? currencyCode,
});
