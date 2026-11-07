// Yoga masks anything that is not a GraphQLError, which is what keeps a SQL
// error from reaching the browser. Deliberate errors — a refused permission, a
// bad credential, an expired invitation — have to be told apart from that, and
// the front reads several of them by message.
export class UserFacingError extends Error {
  readonly extensions: Record<string, unknown>;

  constructor(message: string, code = 'USER_ERROR') {
    super(message);
    this.name = 'UserFacingError';
    this.extensions = { code };
  }
}

export const isUserFacingError = (error: unknown): boolean => {
  if (error instanceof UserFacingError) {
    return true;
  }

  // graphql-js wraps whatever a resolver throws, so the one we recognise is
  // one level down.
  return (
    error instanceof Error &&
    'originalError' in error &&
    error.originalError instanceof UserFacingError
  );
};

// What every other error becomes. It has to look like a GraphQLError or Yoga
// masks it a second time, and it must carry nothing of the original.
export const createMaskedError = (message: string): Error => {
  const error = new Error(message);

  error.name = 'GraphQLError';

  // Error.message is not enumerable, so without this the serialized error is
  // `{"name":"GraphQLError"}` — masked so thoroughly it says nothing at all.
  Object.defineProperty(error, 'toJSON', {
    value: () => ({ message }),
  });

  return error;
};
