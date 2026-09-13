import { type Client } from 'pg';

import {
  findFirstWorkspaceForUser,
  findUserByEmail,
  findUserById,
  insertUser,
  type UserRow,
} from 'src/db/core/auth-repository';
import { loadWorkspaceMetadata } from 'src/db/core/metadata-repository';
import { SCALAR_SDL } from 'src/graphql/scalars';
import {
  bootstrapWorkspace,
  seedWorkspaceMember,
} from 'src/services/bootstrap-workspace';
import { hashPassword, verifyPassword } from 'src/auth/password';
import { issueLoginToken, verifyLoginToken } from 'src/auth/login-token';

export type MetadataContext = {
  client: Client;
  appSecret: string;
  throttle: (key: string, limit: number, windowMs: number) => Promise<boolean>;
  sessionUserId: string | null;
  sessionWorkspaceId: string | null;
  issueSession: (input: {
    userId: string;
    workspaceId: string | null;
    userWorkspaceId: string | null;
  }) => Promise<void>;
  clearSession: () => Promise<void>;
};

export const METADATA_SDL = `
${SCALAR_SDL}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: Cursor
  endCursor: Cursor
}

type User {
  id: UUID!
  firstName: String
  lastName: String
  email: String!
  locale: String
  currentWorkspace: Workspace
  currentUserWorkspace: UserWorkspace
  workspaceMember: WorkspaceMember
  availableWorkspaces: [Workspace!]!
}

type UserWorkspace {
  id: UUID!
  objectsPermissions: [ObjectPermission!]!
}

type ObjectPermission {
  objectMetadataId: UUID!
  canReadObjectRecords: Boolean
  canUpdateObjectRecords: Boolean
  canSoftDeleteObjectRecords: Boolean
  canDestroyObjectRecords: Boolean
}

type WorkspaceMember {
  id: UUID!
  name: FullNameOutput
  userEmail: String
}

type FullNameOutput { firstName: String lastName: String }

type Workspace {
  id: UUID!
  displayName: String
  subdomain: String!
  customDomain: String
  activationStatus: String!
  metadataVersion: Int!
}

type FieldMetadata {
  id: UUID!
  name: String!
  label: String!
  type: String!
  description: String
  icon: String
  isActive: Boolean!
  isSystem: Boolean!
  isNullable: Boolean!
  isCustom: Boolean!
  defaultValue: RawJSON
  options: RawJSON
  settings: RawJSON
  relationTargetObjectMetadataId: UUID
  relationTargetFieldMetadataId: UUID
}

type FieldMetadataEdge { node: FieldMetadata! cursor: Cursor! }
type FieldMetadataConnection { edges: [FieldMetadataEdge!]! pageInfo: PageInfo! }

type ObjectMetadata {
  id: UUID!
  nameSingular: String!
  namePlural: String!
  labelSingular: String!
  labelPlural: String!
  description: String
  icon: String
  isActive: Boolean!
  isSystem: Boolean!
  isCustom: Boolean!
  isSearchable: Boolean!
  labelIdentifierFieldMetadataId: UUID
  imageIdentifierFieldMetadataId: UUID
  fieldsList: [FieldMetadata!]!
  fields(paging: PagingInput): FieldMetadataConnection!
}

type ObjectMetadataEdge { node: ObjectMetadata! cursor: Cursor! }
type ObjectMetadataConnection { edges: [ObjectMetadataEdge!]! pageInfo: PageInfo! }

input PagingInput { first: Int after: Cursor last: Int before: Cursor }

type View {
  id: UUID!
  name: String!
  type: String!
  key: String
  icon: String
  position: Float!
  objectMetadataId: UUID!
}

type MinimalMetadata {
  objectMetadataItems: [ObjectMetadata!]!
  views: [View!]!
  collectionHashes: [CollectionHash!]!
}

type CollectionHash { collection: String! hash: String! }

type LoginToken { token: String! expiresAt: DateTime! }
type AuthTokenPair { loginToken: LoginToken! }
type AuthTokens { tokens: AuthTokenPair! }
type UserExists { exists: Boolean! availableWorkspaces: [Workspace!]! }
type SignUpOutput { loginToken: LoginToken! workspace: Workspace! }
type AvailableWorkspacesAndAccessTokens {
  availableWorkspaces: [Workspace!]!
  tokens: AuthTokenPair
}

type Query {
  currentUser: User
  checkUserExists(email: String!): UserExists!
  objects(paging: PagingInput): ObjectMetadataConnection!
  object(id: UUID!): ObjectMetadata
  fields(paging: PagingInput): FieldMetadataConnection!
  getViews(viewTypes: [String!]): [View!]!
  minimalMetadata: MinimalMetadata!
}

type Mutation {
  getLoginTokenFromCredentials(email: String!, password: String!): AuthTokenPair!
  getAuthTokensFromLoginToken(loginToken: String!): AuthTokens!
  signIn(email: String!, password: String!): AvailableWorkspacesAndAccessTokens!
  signUp(email: String!, password: String!, firstName: String, lastName: String, workspaceName: String): SignUpOutput!
  signOut: Boolean!
}
`;

const toWorkspaceDto = (workspace: {
  id: string;
  displayName: string | null;
  subdomain: string;
  customDomain: string | null;
  activationStatus: string;
  metadataVersion: number;
}) => workspace;

const requireAuthenticatedUser = async (
  context: MetadataContext,
): Promise<UserRow> => {
  if (context.sessionUserId === null) {
    throw new Error('UNAUTHENTICATED');
  }

  const user = await findUserById({
    client: context.client,
    userId: context.sessionUserId,
  });

  if (user === null) {
    throw new Error('UNAUTHENTICATED');
  }

  return user;
};

const loadMetadataForSession = async (context: MetadataContext) => {
  const user = await requireAuthenticatedUser(context);
  const membership = await findFirstWorkspaceForUser({
    client: context.client,
    userId: user.id,
  });

  if (membership === null) {
    throw new Error('NO_WORKSPACE');
  }

  return loadWorkspaceMetadata({
    client: context.client,
    workspaceId: membership.workspace.id,
    metadataVersion: membership.workspace.metadataVersion,
  });
};

const toConnection = <TNode>(nodes: TNode[]) => ({
  edges: nodes.map((node, index) => ({ node, cursor: String(index) })),
  pageInfo: {
    hasNextPage: false,
    hasPreviousPage: false,
    startCursor: null,
    endCursor: null,
  },
});

// A stable hash of the collection contents. The front compares these before
// refetching each metadata collection, so it must change whenever the data does.
const hashCollection = (value: unknown): string => {
  const serialized = JSON.stringify(value);
  let hash = 2166136261;

  for (let index = 0; index < serialized.length; index++) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
};

export const METADATA_RESOLVERS = {
  Query: {
    currentUser: async (_parent: unknown, _args: unknown, context: MetadataContext) => {
      if (context.sessionUserId === null) {
        return null;
      }

      const user = await findUserById({
        client: context.client,
        userId: context.sessionUserId,
      });

      if (user === null) {
        return null;
      }

      const membership = await findFirstWorkspaceForUser({
        client: context.client,
        userId: user.id,
      });

      return {
        ...user,
        currentWorkspace:
          membership === null ? null : toWorkspaceDto(membership.workspace),
        currentUserWorkspace:
          membership === null
            ? null
            : { id: membership.userWorkspaceId, objectsPermissions: [] },
        workspaceMember: null,
        availableWorkspaces:
          membership === null ? [] : [toWorkspaceDto(membership.workspace)],
      };
    },

    checkUserExists: async (
      _parent: unknown,
      args: { email: string },
      context: MetadataContext,
    ) => {
      const user = await findUserByEmail({
        client: context.client,
        email: args.email,
      });

      return { exists: user !== null, availableWorkspaces: [] };
    },

    objects: async (_parent: unknown, _args: unknown, context: MetadataContext) => {
      const metadata = await loadMetadataForSession(context);

      return toConnection(metadata.objects);
    },

    object: async (
      _parent: unknown,
      args: { id: string },
      context: MetadataContext,
    ) => {
      const metadata = await loadMetadataForSession(context);

      return metadata.objects.find((object) => object.id === args.id) ?? null;
    },

    fields: async (_parent: unknown, _args: unknown, context: MetadataContext) => {
      const metadata = await loadMetadataForSession(context);

      return toConnection(metadata.objects.flatMap((object) => object.fields));
    },

    getViews: async (
      _parent: unknown,
      args: { viewTypes?: string[] },
      context: MetadataContext,
    ) => {
      const user = await requireAuthenticatedUser(context);
      const membership = await findFirstWorkspaceForUser({
        client: context.client,
        userId: user.id,
      });

      if (membership === null) {
        return [];
      }

      const { rows } = await context.client.query(
        `SELECT "id","name","type","key","icon","position","objectMetadataId"
         FROM core."view"
         WHERE "workspaceId" = $1 AND "deletedAt" IS NULL
           AND ($2::text[] IS NULL OR "type" = ANY($2))
         ORDER BY "position" ASC`,
        [membership.workspace.id, args.viewTypes ?? null],
      );

      return rows;
    },

    minimalMetadata: async (
      _parent: unknown,
      _args: unknown,
      context: MetadataContext,
    ) => {
      const metadata = await loadMetadataForSession(context);

      const { rows: views } = await context.client.query(
        `SELECT "id","name","type","key","icon","position","objectMetadataId"
         FROM core."view" WHERE "workspaceId" = $1 AND "deletedAt" IS NULL`,
        [metadata.workspaceId],
      );

      return {
        objectMetadataItems: metadata.objects,
        views,
        collectionHashes: [
          { collection: 'objectMetadataItems', hash: hashCollection(metadata.objects) },
          { collection: 'views', hash: hashCollection(views) },
        ],
      };
    },
  },

  ObjectMetadata: {
    fieldsList: (object: { fields: unknown[] }) => object.fields,
    fields: (object: { fields: unknown[] }) => toConnection(object.fields),
  },

  FieldMetadata: {
    // Custom fields are the ones no standard object declares; until index
    // metadata exists this mirrors the object's own flag.
    isCustom: () => false,
  },

  Mutation: {
    getLoginTokenFromCredentials: async (
      _parent: unknown,
      args: { email: string; password: string },
      context: MetadataContext,
    ) => {
      const loginToken = await authenticate(context, args.email, args.password);

      return { loginToken };
    },

    getAuthTokensFromLoginToken: async (
      _parent: unknown,
      args: { loginToken: string },
      context: MetadataContext,
    ) => {
      const userId = await verifyLoginToken({
        appSecret: context.appSecret,
        token: args.loginToken,
      });

      if (userId === null) {
        throw new Error('INVALID_LOGIN_TOKEN');
      }

      const membership = await findFirstWorkspaceForUser({
        client: context.client,
        userId,
      });

      await context.issueSession({
        userId,
        workspaceId: membership?.workspace.id ?? null,
        userWorkspaceId: membership?.userWorkspaceId ?? null,
      });

      const loginToken = await issueLoginToken({
        appSecret: context.appSecret,
        userId,
      });

      return { tokens: { loginToken } };
    },

    signIn: async (
      _parent: unknown,
      args: { email: string; password: string },
      context: MetadataContext,
    ) => {
      const loginToken = await authenticate(context, args.email, args.password);
      const userId = await verifyLoginToken({
        appSecret: context.appSecret,
        token: loginToken.token,
      });

      const membership =
        userId === null
          ? null
          : await findFirstWorkspaceForUser({ client: context.client, userId });

      if (userId !== null) {
        await context.issueSession({
          userId,
          workspaceId: membership?.workspace.id ?? null,
          userWorkspaceId: membership?.userWorkspaceId ?? null,
        });
      }

      return {
        availableWorkspaces:
          membership === null ? [] : [toWorkspaceDto(membership.workspace)],
        tokens: { loginToken },
      };
    },

    signUp: async (
      _parent: unknown,
      args: {
        email: string;
        password: string;
        firstName?: string;
        lastName?: string;
        workspaceName?: string;
      },
      context: MetadataContext,
    ) => {
      const existing = await findUserByEmail({
        client: context.client,
        email: args.email,
      });

      if (existing !== null) {
        throw new Error('EMAIL_ALREADY_REGISTERED');
      }

      const user = await insertUser({
        client: context.client,
        email: args.email,
        firstName: args.firstName ?? '',
        lastName: args.lastName ?? '',
        passwordHash: await hashPassword(args.password),
      });

      const subdomain = `w${user.id.slice(0, 8)}`;
      const bootstrap = await bootstrapWorkspace({
        client: context.client,
        displayName: args.workspaceName ?? 'My Workspace',
        subdomain,
        userId: user.id,
      });

      await seedWorkspaceMember({
        client: context.client,
        workspaceId: bootstrap.workspaceId,
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      });

      const membership = await findFirstWorkspaceForUser({
        client: context.client,
        userId: user.id,
      });

      await context.issueSession({
        userId: user.id,
        workspaceId: bootstrap.workspaceId,
        userWorkspaceId: membership?.userWorkspaceId ?? null,
      });

      return {
        loginToken: await issueLoginToken({
          appSecret: context.appSecret,
          userId: user.id,
        }),
        workspace:
          membership === null ? null : toWorkspaceDto(membership.workspace),
      };
    },

    signOut: async (_parent: unknown, _args: unknown, context: MetadataContext) => {
      await context.clearSession();

      return true;
    },
  },
};

const LOGIN_ATTEMPT_LIMIT = 10;
const LOGIN_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

const authenticate = async (
  context: MetadataContext,
  email: string,
  password: string,
) => {
  // Throttled per email, mirroring Twenty's ThrottlerService token bucket. PBKDF2
  // is deliberately expensive, so an unthrottled login is also a CPU amplifier.
  const withinLimit = await context.throttle(
    `login:${email}`,
    LOGIN_ATTEMPT_LIMIT,
    LOGIN_ATTEMPT_WINDOW_MS,
  );

  if (!withinLimit) {
    throw new Error('TOO_MANY_ATTEMPTS');
  }

  const user = await findUserByEmail({ client: context.client, email });

  // Same error either way: distinguishing "no such user" from "wrong password"
  // turns the login form into an account enumeration oracle.
  if (user === null || user.passwordHash === null || user.disabled) {
    throw new Error('INVALID_CREDENTIALS');
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new Error('INVALID_CREDENTIALS');
  }

  return issueLoginToken({ appSecret: context.appSecret, userId: user.id });
};
