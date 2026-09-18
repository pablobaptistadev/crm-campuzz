import { describe, expect, it } from 'vitest';

import { FinanceiroError } from 'src/core/domain/errors/financeiro.error';
import { resolveBusinessUnit } from 'src/core/use-cases/resolve-business-unit.use-case';
import {
  buildBusinessUnit,
  FakeBusinessUnitRepository,
  FakeCrmDirectory,
} from 'src/core/__tests__/fakes';

describe('resolveBusinessUnit', () => {
  it('usa a BU do proprio registro quando ele tem uma', async () => {
    const own = buildBusinessUnit({ id: 'bu-propria', isDefault: false });
    const padrao = buildBusinessUnit({ id: 'bu-padrao', isDefault: true });
    const businessUnits = new FakeBusinessUnitRepository([own, padrao]);

    businessUnits.byPerson.set('pessoa-1', 'bu-propria');

    const resolved = await resolveBusinessUnit(
      { businessUnits, directory: new FakeCrmDirectory() },
      { type: 'PERSON', recordId: 'pessoa-1' },
    );

    expect(resolved.id).toBe('bu-propria');
  });

  it('um membro sem BU propria herda a do clube dele', async () => {
    const doClube = buildBusinessUnit({ id: 'bu-clube', isDefault: false });
    const padrao = buildBusinessUnit({ id: 'bu-padrao', isDefault: true });
    const businessUnits = new FakeBusinessUnitRepository([doClube, padrao]);

    businessUnits.byCompany.set('clube-1', 'bu-clube');

    const resolved = await resolveBusinessUnit(
      {
        businessUnits,
        directory: new FakeCrmDirectory({}, { 'pessoa-1': 'clube-1' }),
      },
      { type: 'PERSON', recordId: 'pessoa-1' },
    );

    expect(resolved.id).toBe('bu-clube');
  });

  it('cai na BU padrao quando nem o registro nem o clube tem uma', async () => {
    const businessUnits = new FakeBusinessUnitRepository([
      buildBusinessUnit({ id: 'bu-padrao', isDefault: true }),
    ]);

    const resolved = await resolveBusinessUnit(
      {
        businessUnits,
        directory: new FakeCrmDirectory({}, { 'pessoa-1': 'clube-sem-bu' }),
      },
      { type: 'PERSON', recordId: 'pessoa-1' },
    );

    expect(resolved.id).toBe('bu-padrao');
  });

  it('um clube nao herda BU de ninguem: ou tem a dele, ou cai na padrao', async () => {
    const businessUnits = new FakeBusinessUnitRepository([
      buildBusinessUnit({ id: 'bu-padrao', isDefault: true }),
    ]);

    const resolved = await resolveBusinessUnit(
      { businessUnits, directory: new FakeCrmDirectory() },
      { type: 'COMPANY', recordId: 'clube-1' },
    );

    expect(resolved.id).toBe('bu-padrao');
  });

  it('avisa quando nao ha BU nenhuma para usar', async () => {
    await expect(
      resolveBusinessUnit(
        {
          businessUnits: new FakeBusinessUnitRepository([]),
          directory: new FakeCrmDirectory(),
        },
        { type: 'PERSON', recordId: 'pessoa-1' },
      ),
    ).rejects.toThrowError(FinanceiroError);
  });
});
