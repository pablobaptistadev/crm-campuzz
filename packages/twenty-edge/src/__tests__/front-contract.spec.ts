import { makeExecutableSchema } from '@graphql-tools/schema';
import { parse, validate } from 'graphql';
import { describe, expect, it } from 'vitest';

import { METADATA_SDL } from 'src/graphql/metadata-schema';

// twenty-front's own documents, copied verbatim from
// packages/twenty-front/src/modules/**. If one of these stops validating, the
// front breaks at boot — the failure is a blank loading skeleton with a console
// error, which is easy to misread as a network problem.
const schema = makeExecutableSchema({ typeDefs: METADATA_SDL });

const expectValid = (document: string) => {
  const errors = validate(schema, parse(document));

  expect(errors.map((error) => error.message)).toEqual([]);
};

describe('twenty-front metadata documents', () => {
  it('validates the ObjectMetadataItems query and its fragment', () => {
    expectValid(`
      fragment ObjectMetadataFields on Object {
        id
        universalIdentifier
        nameSingular
        namePlural
        labelSingular
        labelPlural
        color
        description
        icon
        isRemote
        isActive
        isSystem
        isUIEditable
        isUICreatable
        writability
        createdAt
        updatedAt
        labelIdentifierFieldMetadataId
        imageIdentifierFieldMetadataId
        applicationId
        shortcut
        isLabelSyncedWithName
        isSearchable
        openRecordIn
        duplicateCriteria
        searchFieldMetadataList {
          id fieldMetadataId tsVectorFieldMetadataId position createdAt updatedAt
        }
        indexMetadataList {
          id createdAt updatedAt name indexWhereClause indexType isUnique isCustom
          indexFieldMetadataList { id fieldMetadataId subFieldName createdAt updatedAt order }
        }
        fieldsList {
          id universalIdentifier type name label description icon isActive isSystem
          isUIEditable writability isNullable isUnique isSearchable createdAt updatedAt
          defaultValue options settings isLabelSyncedWithName morphId applicationId
          relation {
            type
            sourceObjectMetadata { id nameSingular namePlural }
            targetObjectMetadata { id nameSingular namePlural }
            sourceFieldMetadata { id name }
            targetFieldMetadata { id name }
          }
          morphRelations {
            type
            sourceObjectMetadata { id nameSingular namePlural }
            targetObjectMetadata { id nameSingular namePlural }
            sourceFieldMetadata { id name }
            targetFieldMetadata { id name }
          }
        }
      }

      query ObjectMetadataItems {
        objects(paging: { first: 1000 }) {
          edges { node { ...ObjectMetadataFields } }
          pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
        }
      }
    `);
  });

  it('validates the current user query', () => {
    expectValid(`
      query GetCurrentUser {
        currentUser {
          id
          email
          firstName
          lastName
          currentWorkspace { id displayName subdomain metadataVersion activationStatus }
          currentUserWorkspace {
            id
            objectsPermissions {
              objectMetadataId
              canReadObjectRecords
              canUpdateObjectRecords
              canSoftDeleteObjectRecords
              canDestroyObjectRecords
            }
          }
          availableWorkspaces { id displayName subdomain }
        }
      }
    `);
  });

  it('validates the sign-in and sign-up mutations', () => {
    expectValid(`
      mutation SignIn($email: String!, $password: String!) {
        signIn(email: $email, password: $password) {
          availableWorkspaces { id displayName subdomain }
          tokens { loginToken { token expiresAt } }
        }
      }
    `);

    expectValid(`
      mutation GetAuthTokensFromLoginToken($loginToken: String!) {
        getAuthTokensFromLoginToken(loginToken: $loginToken) {
          tokens { loginToken { token expiresAt } }
        }
      }
    `);
  });

  it('validates the minimal metadata query the front boots on', () => {
    expectValid(`
      query FindMinimalMetadata {
        minimalMetadata {
          objectMetadataItems { id nameSingular namePlural labelSingular labelPlural icon isActive isSystem }
          views { id name type key objectMetadataId }
          collectionHashes { collection hash }
        }
      }
    `);
  });
});
