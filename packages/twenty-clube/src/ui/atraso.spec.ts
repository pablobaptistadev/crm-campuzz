import { describe, expect, it } from 'vitest';

import { type Cobranca, situacaoDeCobranca } from 'src/ui/atraso';

const HOJE = '2026-09-19';

const manual = (extra: Partial<Cobranca> = {}): Cobranca => ({
  origem: 'manual',
  situacao: 'PENDENTE',
  vence: '2026-12-01',
  pagaEm: null,
  ...extra,
});

const automatico = (extra: Partial<Cobranca> = {}): Cobranca => ({
  origem: 'automatico',
  situacao: 'PENDING',
  vence: '2026-12-01',
  pagaEm: null,
  ...extra,
});

describe('situação de cobrança dos dois financeiros', () => {
  it('fica em dia quando nenhum dos dois tem atraso', () => {
    const situacao = situacaoDeCobranca([manual(), automatico()], HOJE);

    expect(situacao.emAtraso).toBe(false);
    expect(situacao.origensEmAtraso).toEqual([]);
  });

  it('fica em atraso quando só o manual está atrasado', () => {
    const situacao = situacaoDeCobranca(
      [manual({ situacao: 'ATRASADA' }), automatico()],
      HOJE,
    );

    expect(situacao.emAtraso).toBe(true);
    expect(situacao.origensEmAtraso).toEqual(['manual']);
  });

  it('fica em atraso quando só o automático está atrasado', () => {
    const situacao = situacaoDeCobranca(
      [manual(), automatico({ situacao: 'OVERDUE' })],
      HOJE,
    );

    expect(situacao.emAtraso).toBe(true);
    expect(situacao.origensEmAtraso).toEqual(['automatico']);
  });

  it('aponta os dois quando os dois estão atrasados', () => {
    const situacao = situacaoDeCobranca(
      [manual({ situacao: 'ATRASADA' }), automatico({ situacao: 'OVERDUE' })],
      HOJE,
    );

    expect(situacao.origensEmAtraso).toEqual(['manual', 'automatico']);
    expect(situacao.atrasadasPorOrigem).toEqual({ manual: 1, automatico: 1 });
  });

  // Pagar no gateway não quita a parcela lançada à mão. Exigir os dois em atraso
  // esconderia exatamente este caso.
  it('não deixa o lado pago encobrir o lado devendo', () => {
    const situacao = situacaoDeCobranca(
      [
        manual({ situacao: 'ATRASADA' }),
        automatico({ situacao: 'PAID', pagaEm: '2026-09-10' }),
      ],
      HOJE,
    );

    expect(situacao.emAtraso).toBe(true);
  });

  it('trata vencida e não paga como atraso mesmo com a tag em pendente', () => {
    const situacao = situacaoDeCobranca(
      [manual({ situacao: 'PENDENTE', vence: '2026-09-14' })],
      HOJE,
    );

    expect(situacao.emAtraso).toBe(true);
  });

  it('não acusa atraso no dia do vencimento', () => {
    const situacao = situacaoDeCobranca(
      [manual({ situacao: 'PENDENTE', vence: HOJE })],
      HOJE,
    );

    expect(situacao.emAtraso).toBe(false);
  });

  it('ignora cancelada, que não é dívida', () => {
    const situacao = situacaoDeCobranca(
      [automatico({ situacao: 'CANCELED', vence: '2026-01-01' })],
      HOJE,
    );

    expect(situacao.emAtraso).toBe(false);
  });

  // O gateway manda dueAt com hora; comparar a string inteira faria
  // '2026-09-19T00:00:00Z' < '2026-09-19' dar verdadeiro e inventar um atraso.
  it('não inventa atraso quando o vencimento vem com hora', () => {
    const situacao = situacaoDeCobranca(
      [automatico({ vence: `${HOJE}T03:00:00.000Z` })],
      HOJE,
    );

    expect(situacao.emAtraso).toBe(false);
  });

  it('considera paga quem tem data de pagamento, mesmo sem a tag', () => {
    const situacao = situacaoDeCobranca(
      [manual({ situacao: 'PENDENTE', vence: '2026-01-01', pagaEm: '2026-01-02' })],
      HOJE,
    );

    expect(situacao.emAtraso).toBe(false);
  });

  it('sem cobrança nenhuma, não há atraso', () => {
    expect(situacaoDeCobranca([], HOJE).emAtraso).toBe(false);
  });
});
