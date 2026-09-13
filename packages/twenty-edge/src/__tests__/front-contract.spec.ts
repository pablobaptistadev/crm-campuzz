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
  const errors = validate(schema, parse(document))
    .map((error) => error.message)
    // These tests concatenate every auth fragment into each document for
    // brevity; Apollo only ships the ones a document uses, so an unused
    // fragment here is an artifact of the test, not a contract break.
    .filter((message) => !message.includes('is never used'));

  expect(errors).toEqual([]);
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

  // Everything below is copied verbatim from
  // packages/twenty-front/src/modules/auth/graphql/**.
  const AUTH_FRAGMENTS = `
    fragment AuthTokenFragment on AuthToken { token expiresAt }
    fragment AuthTokenPairFragment on AuthTokenPair {
      accessOrWorkspaceAgnosticToken { ...AuthTokenFragment }
      refreshToken { ...AuthTokenFragment }
    }
    fragment AvailableWorkspaceFragment on AvailableWorkspace {
      id displayName loginToken inviteHash personalInviteToken
      workspaceUrls { subdomainUrl customUrl }
      logo
      sso { type id issuer name status }
    }
    fragment AvailableWorkspacesFragment on AvailableWorkspaces {
      availableWorkspacesForSignIn { ...AvailableWorkspaceFragment }
      availableWorkspacesForSignUp { ...AvailableWorkspaceFragment }
    }
  `;

  it('validates checkUserExists, the first call the login screen makes', () => {
    expectValid(`
      query CheckUserExists($email: String!, $captchaToken: String) {
        checkUserExists(email: $email, captchaToken: $captchaToken) {
          exists
          availableWorkspacesCount
          isEmailVerified
        }
      }
    `);
  });

  it('validates signIn', () => {
    expectValid(`
      ${AUTH_FRAGMENTS}
      mutation SignIn($email: String!, $password: String!, $captchaToken: String) {
        signIn(email: $email, password: $password, captchaToken: $captchaToken) {
          availableWorkspaces { ...AvailableWorkspacesFragment }
          tokens { ...AuthTokenPairFragment }
        }
      }
    `);
  });

  it('validates signUp', () => {
    expectValid(`
      ${AUTH_FRAGMENTS}
      mutation SignUp(
        $email: String!
        $password: String!
        $captchaToken: String
        $locale: String
        $verifyEmailRedirectPath: String
      ) {
        signUp(
          email: $email
          password: $password
          captchaToken: $captchaToken
          locale: $locale
          verifyEmailRedirectPath: $verifyEmailRedirectPath
        ) {
          availableWorkspaces { ...AvailableWorkspacesFragment }
          tokens { ...AuthTokenPairFragment }
        }
      }
    `);
  });

  it('validates the login-token hand-off', () => {
    expectValid(`
      ${AUTH_FRAGMENTS}
      mutation GetLoginTokenFromCredentials(
        $email: String!
        $password: String!
        $captchaToken: String
        $origin: String!
      ) {
        getLoginTokenFromCredentials(
          email: $email
          password: $password
          captchaToken: $captchaToken
          origin: $origin
        ) {
          loginToken { ...AuthTokenFragment }
        }
      }
    `);

    expectValid(`
      ${AUTH_FRAGMENTS}
      mutation getAuthTokensFromLoginToken($loginToken: String!, $origin: String!) {
        getAuthTokensFromLoginToken(loginToken: $loginToken, origin: $origin) {
          tokens { ...AuthTokenPairFragment }
        }
      }
    `);
  });

  it('validates signOut and the public workspace lookup', () => {
    expectValid(`
      mutation SignOut($refreshToken: String) { signOut(refreshToken: $refreshToken) }
    `);

    expectValid(`
      query GetPublicWorkspaceDataByDomain($origin: String!) {
        getPublicWorkspaceDataByDomain(origin: $origin) {
          id
          logo
          displayName
          workspaceUrls { subdomainUrl customUrl }
          authProviders {
            sso { id name type status issuer }
            google magicLink password microsoft
          }
          authBypassProviders { google password microsoft }
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
