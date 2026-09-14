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

// Keyset pagination: (a > v1) OR (a = v1 AND b > v2) OR ... Offset would skip or
// repeat rows whenever a concurrent write shifts the result set.
export const buildCursorFilter = ({
  cursorPayload,
  orderBy,
  isBackward,
}: {
  cursorPayload: CursorPayload;
  orderBy: { fieldName: string; direction: OrderByDirection }[];
  isBackward: boolean;
}): { fieldName: string; operator: 'gt' | 'lt' | 'eqStrict'; value: unknown }[][] => {
  const groups: {
    fieldName: string;
    operator: 'gt' | 'lt' | 'eqStrict';
    value: unknown;
  }[][] = [];

  for (let index = 0; index < orderBy.length; index++) {
    const group: {
      fieldName: string;
      operator: 'gt' | 'lt' | 'eqStrict';
      value: unknown;
    }[] = [];

    for (let previous = 0; previous < index; previous++) {
      const { fieldName } = orderBy[previous];

      group.push({
        fieldName,
        operator: 'eqStrict',
        value: cursorPayload[fieldName],
      });
    }

    const { fieldName, direction } = orderBy[index];
    const descending = isDescending(direction) !== isBackward;

    group.push({
      fieldName,
      operator: descending ? 'lt' : 'gt',
      value: cursorPayload[fieldName],
    });

    groups.push(group);
  }

  return groups;
};
