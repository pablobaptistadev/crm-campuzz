import { GraphQLScalarType, Kind } from 'graphql';

const identity = (value: unknown): unknown => value;

const buildPassthroughScalar = (name: string, description: string) =>
  new GraphQLScalarType({
    name,
    description,
    serialize: identity,
    parseValue: identity,
    parseLiteral: (node) => {
      if (node.kind === Kind.STRING || node.kind === Kind.ENUM) {
        return node.value;
      }

      if (node.kind === Kind.INT || node.kind === Kind.FLOAT) {
        return Number(node.value);
      }

      if (node.kind === Kind.BOOLEAN) {
        return node.value;
      }

      return null;
    },
  });

export const UUIDScalar = buildPassthroughScalar('UUID', 'A UUID string');
export const DateTimeScalar = buildPassthroughScalar(
  'DateTime',
  'An ISO-8601 timestamp',
);
// Date-only values stay strings end to end: turning them into Date objects
// reintroduces a time component that never existed.
export const DateScalar = buildPassthroughScalar('Date', 'A YYYY-MM-DD date');
export const CursorScalar = buildPassthroughScalar(
  'Cursor',
  'An opaque keyset pagination cursor',
);
export const BigFloatScalar = buildPassthroughScalar(
  'BigFloat',
  'An arbitrary-precision number serialized as a string',
);
export const PositionScalar = buildPassthroughScalar(
  'Position',
  'A fractional position used for manual ordering',
);
export const RawJSONScalar = new GraphQLScalarType({
  name: 'RawJSON',
  description: 'Arbitrary JSON',
  serialize: identity,
  parseValue: identity,
  parseLiteral: () => null,
});

// The front's analytics mutation declares its payload as JSON, a different
// scalar name from the RawJSON the record API uses.
export const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'Arbitrary JSON',
  serialize: identity,
  parseValue: identity,
  parseLiteral: () => null,
});

export const SCALAR_RESOLVERS = {
  UUID: UUIDScalar,
  DateTime: DateTimeScalar,
  Date: DateScalar,
  Cursor: CursorScalar,
  BigFloat: BigFloatScalar,
  Position: PositionScalar,
  RawJSON: RawJSONScalar,
};

export const SCALAR_SDL = `
scalar UUID
scalar DateTime
scalar Date
scalar Cursor
scalar BigFloat
scalar Position
scalar RawJSON
`;
