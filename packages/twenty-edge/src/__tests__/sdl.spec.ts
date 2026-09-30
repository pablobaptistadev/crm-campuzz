import { makeExecutableSchema } from '@graphql-tools/schema';
import {
  buildSchema,
  getIntrospectionQuery,
  graphqlSync,
  parse,
  printSchema,
  validate,
} from 'graphql';
import { describe, expect, it } from 'vitest';

import { buildWorkspaceSchemaSdl } from 'src/graphql/build-sdl';
import { type WorkspaceMetadata } from 'src/metadata/types';
import { getWorkspaceSchemaName } from 'src/metadata/naming';
import { buildStandardObjects } from 'src/standard/objects';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';

const metadata: WorkspaceMetadata = {
  workspaceId: WORKSPACE_ID,
  schemaName: getWorkspaceSchemaName(WORKSPACE_ID),
  metadataVersion: 1,
  objects: buildStandardObjects(WORKSPACE_ID),
};

const sdl = buildWorkspaceSchemaSdl(metadata);

describe('workspace SDL', () => {
  it('parses as a valid GraphQL schema', () => {
    expect(() => buildSchema(sdl)).not.toThrow();
  });

  it('builds an executable schema', () => {
    expect(() => makeExecutableSchema({ typeDefs: sdl })).not.toThrow();
  });

  it('answers introspection, which is what Apollo runs on connect', () => {
    const schema = makeExecutableSchema({ typeDefs: sdl });
    const result = graphqlSync({ schema, source: getIntrospectionQuery() });

    expect(result.errors).toBeUndefined();
  });

  // Shaped exactly like generateFindManyRecordsQuery +
  // mapFieldMetadataToGraphQLQuery in twenty-front: $lastCursor is declared
  // String, and every composite sub-property the front selects into has to be
  // an object type rather than a JSON leaf.
  // The record page's previous/next navigation compares ids, so a uuid column
  // has to accept the ordering operators, not just equality.
  it('accepts the cursor-shaped filter the record page sends', () => {
    const schema = makeExecutableSchema({ typeDefs: sdl });

    const errors = validate(
      schema,
      parse(`
        query FindManyCompanies($filter: CompanyFilterInput, $orderBy: [CompanyOrderByInput], $limit: Int) {
          companies(filter: $filter, orderBy: $orderBy, first: $limit) {
            edges { node { id } }
          }
        }
      `),
    );

    expect(errors.map((error) => error.message)).toEqual([]);

    const filterType = printSchema(buildSchema(sdl))
      .split('input UUIDFilter {')[1]
      .split('}')[0];

    for (const operator of ['gt', 'gte', 'lt', 'lte']) {
      expect(filterType).toContain(`${operator}: UUID`);
    }
  });

  it('validates the FindMany query twenty-front generates', () => {
    const schema = makeExecutableSchema({ typeDefs: sdl });

    const errors = validate(
      schema,
      parse(`
        query FindManyCompanies(
          $filter: CompanyFilterInput
          $orderBy: [CompanyOrderByInput]
          $lastCursor: String
          $limit: Int
          $offset: Int
        ) {
          companies(
            filter: $filter
            orderBy: $orderBy
            first: $limit
            after: $lastCursor
            offset: $offset
          ) {
            edges {
              node {
                id
                name
                employees
                createdAt
                updatedAt
                deletedAt
                domainName {
                  primaryLinkUrl
                  primaryLinkLabel
                  secondaryLinks { label url }
                }
                annualRecurringRevenue { amountMicros currencyCode }
                address {
                  addressStreet1
                  addressStreet2
                  addressCity
                  addressState
                  addressCountry
                  addressPostcode
                  addressLat
                  addressLng
                }
                people {
                  edges {
                    node {
                      id
                      name { firstName lastName }
                      emails { primaryEmail additionalEmails }
                      phones {
                        primaryPhoneNumber
                        primaryPhoneCountryCode
                        primaryPhoneCallingCode
                        additionalPhones { number callingCode countryCode }
                      }
                    }
                  }
                }
              }
              cursor
            }
            pageInfo {
              hasNextPage
              hasPreviousPage
              startCursor
              endCursor
            }
            totalCount
          }
        }
      `),
    );

    expect(errors.map((error) => error.message)).toEqual([]);
  });

  it('names root fields the way twenty-front expects', () => {
    const printed = printSchema(buildSchema(sdl));

    // From get-resolver-name.util.ts: plural for findMany, singular for findOne.
    expect(printed).toContain('companies(');
    expect(printed).toContain('createCompany(');
    expect(printed).toContain('updateCompany(');
    expect(printed).toContain('deleteCompany(');
    expect(printed).toContain('destroyCompany(');
    expect(printed).toContain('restoreCompany(');
    // The front never queries a `companyCollection` field.
    expect(printed).not.toContain('companyCollection');
  });

  it('puts totalCount next to edges, not inside pageInfo', () => {
    const printed = printSchema(buildSchema(sdl));
    const connectionBlock = printed
      .split('type CompanyConnection {')[1]
      .split('}')[0];

    expect(connectionBlock).toContain('edges: [CompanyEdge!]!');
    expect(connectionBlock).toContain('pageInfo: PageInfo!');
    expect(connectionBlock).toContain('totalCount: Int');
  });

  it('exposes the join column alongside the relation object', () => {
    const printed = printSchema(buildSchema(sdl));
    const personBlock = printed.split('type Person {')[1].split('}')[0];

    expect(personBlock).toContain('companyId: UUID');
    expect(personBlock).toContain('company: Company');
  });

  it('models a one-to-many relation as a connection', () => {
    const printed = printSchema(buildSchema(sdl));
    const companyBlock = printed.split('type Company {')[1].split('}')[0];

    expect(companyBlock).toContain('people: PersonConnection');
  });

  it('flattens composites into their own object types', () => {
    const printed = printSchema(buildSchema(sdl));

    expect(printed).toContain('type FullName {');
    expect(printed).toContain('type Address {');
    // ACTOR hides workspaceMemberId and name from input but keeps them on output.
    expect(printed).toContain('type Actor {');
  });

  it('generates a select enum per field', () => {
    const printed = printSchema(buildSchema(sdl));

    expect(printed).toContain('enum OpportunityStageEnum {');
    expect(printed).toContain('enum TaskStatusEnum {');
  });
});
