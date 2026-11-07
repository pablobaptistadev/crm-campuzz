import { type OrderByDirection } from 'src/orm/select';

export type CursorPayload = Record<string, unknown>;

const encodeBase64 = (value: string): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(value)));

const decodeBase64 = (value: string): string =>
  new TextDecoder().decode(
    Uint8Array.from(atob(value), (character) => character.charCodeAt(0)),
  );

export const encodeCursor = (payload: CursorPayload): string =>
  encodeBase64(JSON.stringify(payload));

export const decodeCursor = (cursor: string): CursorPayload => {
  try {
    const parsed: unknown = JSON.parse(decodeBase64(cursor));

    if (parsed === null || typeof parsed !== 'object') {
      throw new Error('Cursor payload is not an object');
    }

    return parsed as CursorPayload;
  } catch {
    throw new Error('Invalid cursor');
  }
};

const isDescending = (direction: OrderByDirection): boolean =>
  direction === 'DescNullsFirst' || direction === 'DescNullsLast';

const isNullsLast = (direction: OrderByDirection): boolean =>
  direction === 'AscNullsLast' || direction === 'DescNullsLast';

export type CursorCondition = {
  fieldName: string;
  operator: 'gt' | 'lt' | 'eqStrict' | 'isStrictly';
  value: unknown;
};

// Keyset pagination: (a > v1) OR (a = v1 AND b > v2) OR ... Offset would skip or
// repeat rows whenever a concurrent write shifts the result set.
//
// NULL never compares: `a > NULL` and `a = NULL` are never true, so a page that
// ended on a NULL (a row inserted without a position, say) used to come back
// empty and the rest of the list vanished. Equality with NULL is IS NULL, and
// NULLs join the rows after the cursor on whichever side the ORDER BY puts them.
export const buildCursorFilter = ({
  cursorPayload,
  orderBy,
  isBackward,
}: {
  cursorPayload: CursorPayload;
  orderBy: { fieldName: string; direction: OrderByDirection }[];
  isBackward: boolean;
}): CursorCondition[][] => {
  const valueOf = (fieldName: string): unknown =>
    cursorPayload[fieldName] ?? null;

  const equalTo = (fieldName: string): CursorCondition =>
    valueOf(fieldName) === null
      ? { fieldName, operator: 'isStrictly', value: 'NULL' }
      : { fieldName, operator: 'eqStrict', value: valueOf(fieldName) };

  const groups: CursorCondition[][] = [];

  for (let index = 0; index < orderBy.length; index++) {
    const prefix = orderBy
      .slice(0, index)
      .map(({ fieldName }) => equalTo(fieldName));
    const { fieldName, direction } = orderBy[index];
    const value = valueOf(fieldName);
    // Paginating backwards reads the order in reverse, so the side the NULLs
    // sit on flips with it.
    const nullsComeAfter = isNullsLast(direction) !== isBackward;

    if (value === null) {
      // Among NULLs only the next column breaks the tie; the non-NULL rows are
      // after the cursor only when the order puts the NULLs first.
      if (!nullsComeAfter) {
        groups.push([
          ...prefix,
          { fieldName, operator: 'isStrictly', value: 'NOT_NULL' },
        ]);
      }

      continue;
    }

    const descending = isDescending(direction) !== isBackward;

    groups.push([
      ...prefix,
      { fieldName, operator: descending ? 'lt' : 'gt', value },
    ]);

    if (nullsComeAfter) {
      groups.push([...prefix, { fieldName, operator: 'isStrictly', value: 'NULL' }]);
    }
  }

  return groups;
};
