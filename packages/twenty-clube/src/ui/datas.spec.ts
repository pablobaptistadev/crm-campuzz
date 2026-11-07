import { describe, expect, it } from 'vitest';

import { diasEntre, hojeLocal, somarDias } from 'src/ui/datas';

describe('datas no horário de Brasília', () => {
  // 22h30 em Brasília já é 01h30 do dia seguinte em UTC.
  it('continua sendo hoje depois das 21h', () => {
    expect(hojeLocal(new Date('2026-09-27T01:30:00Z'))).toBe('2026-09-26');
  });

  it('vira o dia à meia-noite de Brasília', () => {
    expect(hojeLocal(new Date('2026-09-27T03:00:00Z'))).toBe('2026-09-27');
  });

  it('conta dias inteiros e aceita data com hora', () => {
    expect(diasEntre('2026-08-31', '2026-09-26')).toBe(26);
    expect(diasEntre('2026-09-26T03:00:00.000Z', '2026-09-26')).toBe(0);
    expect(diasEntre('2026-09-30', '2026-09-26')).toBe(-4);
  });

  it('soma dias atravessando o mês', () => {
    expect(somarDias('2026-09-26', 7)).toBe('2026-10-03');
    expect(somarDias('2026-09-26', -30)).toBe('2026-08-27');
  });
});
