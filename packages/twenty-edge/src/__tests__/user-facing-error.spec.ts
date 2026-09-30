import { GraphQLError } from 'graphql';
import { describe, expect, it } from 'vitest';

import {
  createMaskedError,
  isUserFacingError,
  UserFacingError,
} from 'src/graphql/user-facing-error';
import { PermissionDeniedError } from 'src/services/permissions';

describe('isUserFacingError', () => {
  it('recognises one thrown directly', () => {
    expect(isUserFacingError(new UserFacingError('nope'))).toBe(true);
  });

  // graphql-js wraps whatever a resolver throws, so the one we recognise is one
  // level down — missing this would mask every deliberate error.
  it('recognises one graphql-js has wrapped', () => {
    const wrapped = new GraphQLError('nope', {
      originalError: new UserFacingError('nope'),
    });

    expect(isUserFacingError(wrapped)).toBe(true);
  });

  it('recognises a refused permission', () => {
    expect(
      isUserFacingError(new PermissionDeniedError('read', 'company')),
    ).toBe(true);
  });

  // The whole point: a database error must not reach the browser.
  it('does not recognise anything else', () => {
    expect(isUserFacingError(new Error('relation "x" does not exist'))).toBe(
      false,
    );
    expect(
      isUserFacingError(
        new GraphQLError('boom', {
          originalError: new Error('duplicate key value'),
        }),
      ),
    ).toBe(false);
  });
});

describe('createMaskedError', () => {
  // Yoga masks a second time anything that is not named GraphQLError, and the
  // replacement must carry nothing of what it replaced.
  it('looks like a GraphQLError and says nothing', () => {
    const masked = createMaskedError('Unexpected error.');

    expect(masked.name).toBe('GraphQLError');
    expect(masked.message).toBe('Unexpected error.');
    expect(isUserFacingError(masked)).toBe(false);
  });

  // Error.message is not enumerable: without a toJSON the client receives
  // {"name":"GraphQLError"} and no message at all.
  it('still says something once serialized', () => {
    expect(JSON.parse(JSON.stringify(createMaskedError('Unexpected error.')))).toEqual({
      message: 'Unexpected error.',
    });
  });
});
