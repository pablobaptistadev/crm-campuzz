import { describe, expect, it } from 'vitest';

import { buildCursorFilter, decodeCursor, encodeCursor } from 'src/orm/cursor';
import { type OrderByDirection } from 'src/orm/select';

describe('cursor encoding', () => {
  it('round-trips a payload', () => {
    const payload = { createdAt: '2026-01-01T00:00:00.000Z', id: 'abc' };

    expect(decodeCursor(encodeCursor(payload))).toEqual(payload);
  });

  it('rejects a malformed cursor instead of returning junk', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow('Invalid cursor');
  });
});

describe('buildCursorFilter', () => {
  const cursorPayload = { createdAt: '2026-01-01T00:00:00.000Z', id: 'abc' };

  it('builds the tie-breaking OR chain', () => {
    const groups = buildCursorFilter({
      cursorPayload,
      orderBy: [
        { fieldName: 'createdAt', direction: 'AscNullsLast' },
        { fieldName: 'id', direction: 'AscNullsFirst' },
      ],
      isBackward: false,
    });

    // (createdAt > v) OR (createdAt IS NULL) OR (createdAt = v AND id > v):
    // NULLS LAST puts every NULL createdAt after any value the cursor holds.
    expect(groups).toEqual([
      [{ fieldName: 'createdAt', operator: 'gt', value: cursorPayload.createdAt }],
      [{ fieldName: 'createdAt', operator: 'isStrictly', value: 'NULL' }],
      [
        { fieldName: 'createdAt', operator: 'eqStrict', value: cursorPayload.createdAt },
        { fieldName: 'id', operator: 'gt', value: 'abc' },
      ],
    ]);
  });

  it('compares a NULL boundary with IS NULL, never with = NULL', () => {
    const groups = buildCursorFilter({
      cursorPayload: { position: null, id: 'abc' },
      orderBy: [
        { fieldName: 'position', direction: 'AscNullsFirst' },
        { fieldName: 'id', direction: 'AscNullsFirst' },
      ],
      isBackward: false,
    });

    expect(groups).toEqual([
      [{ fieldName: 'position', operator: 'isStrictly', value: 'NOT_NULL' }],
      [
        { fieldName: 'position', operator: 'isStrictly', value: 'NULL' },
        { fieldName: 'id', operator: 'gt', value: 'abc' },
      ],
    ]);
  });

  it('flips the comparison for a descending order', () => {
    const [firstGroup] = buildCursorFilter({
      cursorPayload,
      orderBy: [{ fieldName: 'createdAt', direction: 'DescNullsLast' }],
      isBackward: false,
    });

    expect(firstGroup[0].operator).toBe('lt');
  });

  it('flips again when paginating backwards', () => {
    const [firstGroup] = buildCursorFilter({
      cursorPayload,
      orderBy: [{ fieldName: 'createdAt', direction: 'DescNullsLast' }],
      isBackward: true,
    });

    expect(firstGroup[0].operator).toBe('gt');
  });
});

// Walks a whole list page by page the way findMany does — WHERE cursor, ORDER
// BY, LIMIT — with the SQL semantics for NULL, so a boundary that lands on a
// NULL is exercised end to end rather than group by group.
describe('keyset pagination over NULL values', () => {
  type Row = { position: number | null; id: string };
  type Direction = OrderByDirection;

  const rows: Row[] = [
    { position: null, id: 'a' },
    { position: 1, id: 'b' },
    { position: null, id: 'c' },
    { position: 2, id: 'd' },
    { position: 2, id: 'e' },
    { position: null, id: 'f' },
    { position: 3, id: 'g' },
    { position: 1, id: 'h' },
    { position: null, id: 'i' },
    { position: 5, id: 'j' },
  ];

  const invert: Record<Direction, Direction> = {
    AscNullsFirst: 'DescNullsLast',
    AscNullsLast: 'DescNullsFirst',
    DescNullsFirst: 'AscNullsLast',
    DescNullsLast: 'AscNullsFirst',
  };

  const compareValues = (
    left: number | string | null,
    right: number | string | null,
    direction: Direction,
  ): number => {
    if (left === right) {
      return 0;
    }

    const nullsFirst = direction.endsWith('NullsFirst');

    if (left === null) {
      return nullsFirst ? -1 : 1;
    }

    if (right === null) {
      return nullsFirst ? 1 : -1;
    }

    const ascending = left < right ? -1 : 1;

    return direction.startsWith('Asc') ? ascending : -ascending;
  };

  const sortRows = (
    list: Row[],
    orderBy: { fieldName: keyof Row; direction: Direction }[],
  ): Row[] =>
    [...list].sort((left, right) => {
      for (const { fieldName, direction } of orderBy) {
        const result = compareValues(left[fieldName], right[fieldName], direction);

        if (result !== 0) {
          return result;
        }
      }

      return 0;
    });

  // Any comparison with NULL is unknown in SQL, which a WHERE treats as false.
  const matches = (row: Row, groups: ReturnType<typeof buildCursorFilter>) =>
    groups.some((group) =>
      group.every(({ fieldName, operator, value }) => {
        const current = row[fieldName as keyof Row];

        switch (operator) {
          case 'isStrictly':
            return value === 'NULL' ? current === null : current !== null;
          case 'eqStrict':
            return current !== null && current === value;
          case 'gt':
            return current !== null && current > (value as number | string);
          case 'lt':
            return current !== null && current < (value as number | string);
        }
      }),
    );

  const walk = (direction: Direction, isBackward: boolean): string[] => {
    const orderBy: { fieldName: keyof Row; direction: Direction }[] = [
      { fieldName: 'position', direction },
      { fieldName: 'id', direction: 'AscNullsFirst' },
    ];
    const sqlOrder = isBackward
      ? orderBy.map((clause) => ({ ...clause, direction: invert[clause.direction] }))
      : orderBy;
    const seen: Row[] = [];
    let cursor: Record<string, unknown> | null = null;

    for (let page = 0; page < 20; page++) {
      const boundary: Record<string, unknown> | null = cursor;
      const remaining: Row[] = sortRows(rows, sqlOrder).filter(
        (row) =>
          boundary === null ||
          matches(row, buildCursorFilter({ cursorPayload: boundary, orderBy, isBackward })),
      );
      const pageRows: Row[] = remaining.slice(0, 3);

      seen.push(...pageRows);

      if (remaining.length <= 3) {
        break;
      }

      const last: Row = pageRows[pageRows.length - 1];

      cursor = { position: last.position, id: last.id };
    }

    const ids = seen.map((row) => row.id);

    return isBackward ? ids.reverse() : ids;
  };

  const directions: Direction[] = [
    'AscNullsFirst',
    'AscNullsLast',
    'DescNullsFirst',
    'DescNullsLast',
  ];

  it.each(directions)('reaches every row exactly once going forward (%s)', (direction) => {
    const expected = sortRows(rows, [
      { fieldName: 'position', direction },
      { fieldName: 'id', direction: 'AscNullsFirst' },
    ]).map((row) => row.id);

    expect(walk(direction, false)).toEqual(expected);
  });

  it.each(directions)('reaches every row exactly once going backward (%s)', (direction) => {
    const expected = sortRows(rows, [
      { fieldName: 'position', direction },
      { fieldName: 'id', direction: 'AscNullsFirst' },
    ]).map((row) => row.id);

    expect(walk(direction, true)).toEqual(expected);
  });

  // The production case: every gateway row was inserted without a position,
  // so the first page ended on a NULL and the second came back empty.
  it('pages through a list where every position is NULL', () => {
    const orderBy = [
      { fieldName: 'position', direction: 'AscNullsFirst' as const },
      { fieldName: 'id', direction: 'AscNullsFirst' as const },
    ];
    const groups = buildCursorFilter({
      cursorPayload: { position: null, id: 'c' },
      orderBy,
      isBackward: false,
    });
    const allNull: Row[] = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ position: null, id }));

    expect(allNull.filter((row) => matches(row, groups)).map((row) => row.id)).toEqual([
      'd',
      'e',
    ]);
  });
});
