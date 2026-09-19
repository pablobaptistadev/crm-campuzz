import { describe, expect, it } from 'vitest';

import { buildCursorFilter, decodeCursor, encodeCursor } from 'src/orm/cursor';

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

    // (createdAt > v) OR (createdAt = v AND id > v)
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual([
      { fieldName: 'createdAt', operator: 'gt', value: cursorPayload.createdAt },
    ]);
    expect(groups[1]).toEqual([
      { fieldName: 'createdAt', operator: 'eqStrict', value: cursorPayload.createdAt },
      { fieldName: 'id', operator: 'gt', value: 'abc' },
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
