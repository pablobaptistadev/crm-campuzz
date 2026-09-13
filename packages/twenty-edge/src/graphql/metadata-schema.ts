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
import {
  createFieldMetadata,
  createObjectMetadata,
} from 'src/services/metadata-mutations';
import { type FieldMetadataType } from 'src/metadata/field-metadata-type';
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

type RelationObjectRef { id: UUID! nameSingular: String! namePlural: String! }
type RelationFieldRef { id: UUID! name: String! }

type FieldRelation {
  type: String
  sourceObjectMetadata: RelationObjectRef
  targetObjectMetadata: RelationObjectRef
  sourceFieldMetadata: RelationFieldRef
  targetFieldMetadata: RelationFieldRef
}

# Named Field / Object, not FieldMetadata / ObjectMetadata: twenty-front's
# fragments are declared "on Field" and "on Object", and a fragment whose type
# condition does not exist makes the whole document fail validation.
type Field {
  id: UUID!
  universalIdentifier: UUID
  type: String!
  name: String!
  label: String!
  description: String
  icon: String
  isActive: Boolean!
  isSystem: Boolean!
  isUIEditable: Boolean!
  writability: String
  isNullable: Boolean!
  isUnique: Boolean
  isSearchable: Boolean
  isCustom: Boolean!
  isLabelSyncedWithName: Boolean
  createdAt: DateTime
  updatedAt: DateTime
  defaultValue: RawJSON
  options: RawJSON
  settings: RawJSON
  morphId: UUID
  applicationId: UUID
  relationTargetObjectMetadataId: UUID
  relationTargetFieldMetadataId: UUID
  relation: FieldRelation
  morphRelations: [FieldRelation!]
}

type FieldEdge { node: Field! cursor: Cursor! }
type FieldConnection { edges: [FieldEdge!]! pageInfo: PageInfo! }

type SearchFieldMetadata {
  id: UUID!
  fieldMetadataId: UUID!
  tsVectorFieldMetadataId: UUID
  position: Float
  createdAt: DateTime
  updatedAt: DateTime
}

type IndexFieldMetadata {
  id: UUID!
  fieldMetadataId: UUID!
  subFieldName: String
  createdAt: DateTime
  updatedAt: DateTime
  order: Int
}

type IndexMetadata {
  id: UUID!
  createdAt: DateTime
  updatedAt: DateTime
  name: String!
  indexWhereClause: String
  indexType: String
  isUnique: Boolean!
  isCustom: Boolean!
  indexFieldMetadataList: [IndexFieldMetadata!]!
}

type Object {
  id: UUID!
  universalIdentifier: UUID
  nameSingular: String!
  namePlural: String!
  labelSingular: String!
  labelPlural: String!
  color: String
  description: String
  icon: String
  isRemote: Boolean!
  isActive: Boolean!
  isSystem: Boolean!
  isCustom: Boolean!
  isUIEditable: Boolean!
  isUICreatable: Boolean!
  writability: String
  createdAt: DateTime
  updatedAt: DateTime
  labelIdentifierFieldMetadataId: UUID
  imageIdentifierFieldMetadataId: UUID
  applicationId: UUID
  shortcut: String
  isLabelSyncedWithName: Boolean
  isSearchable: Boolean!
  openRecordIn: String
  duplicateCriteria: RawJSON
  searchFieldMetadataList: [SearchFieldMetadata!]!
  indexMetadataList: [IndexMetadata!]!
  fieldsList: [Field!]!
  fields(paging: PagingInput): FieldConnection!
}

type ObjectEdge { node: Object! cursor: Cursor! }
type ObjectConnection { edges: [ObjectEdge!]! pageInfo: PageInfo! }

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
  objectMetadataItems: [Object!]!
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
  objects(paging: PagingInput): ObjectConnection!
  object(id: UUID!): Object
  fields(paging: PagingInput): FieldConnection!
  getViews(viewTypes: [String!]): [View!]!
  minimalMetadata: MinimalMetadata!
}

input ObjectCreateInput {
  nameSingular: String!
  namePlural: String!
  labelSingular: String!
  labelPlural: String!
  icon: String
  description: String
}

input FieldOptionInput { value: String! label: String! color: String }

input FieldCreateInput {
  objectMetadataId: UUID!
  name: String!
  label: String!
  type: String!
  isNullable: Boolean
  icon: String
  options: [FieldOptionInput!]
}

input ViewCreateInput {
  objectMetadataId: UUID!
  name: String!
  type: String
  key: String
  icon: String
  position: Float
}

input ViewUpdateInput {
  name: String
  type: String
  icon: String
  position: Float
}

type Mutation {
  createOneObject(input: ObjectCreateInput!): Object!
  createOneField(input: FieldCreateInput!): Field!
  createView(data: ViewCreateInput!): View!
  updateView(id: UUID!, data: ViewUpdateInput!): View
  deleteView(id: UUID!): View
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

const requireWorkspaceId = async (
  context: MetadataContext,
): Promise<string> => {
  const user = await requireAuthenticatedUser(context);
  const membership = await findFirstWorkspaceForUser({
    client: context.client,
    userId: user.id,
  });

  if (membership === null) {
    throw new Error('NO_WORKSPACE');
  }

  return membership.workspace.id;
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

      // The front hides an object whose permission entry is missing, so every
      // object needs one. Until roles exist, the only member of a workspace is
      // its creator and gets full access.
      const objectsPermissions =
        membership === null
          ? []
          : (
              await loadWorkspaceMetadata({
                client: context.client,
                workspaceId: membership.workspace.id,
                metadataVersion: membership.workspace.metadataVersion,
              })
            ).objects.map((object) => ({
              objectMetadataId: object.id,
              canReadObjectRecords: true,
              canUpdateObjectRecords: true,
              canSoftDeleteObjectRecords: true,
              canDestroyObjectRecords: true,
            }));

      return {
        ...user,
        currentWorkspace:
          membership === null ? null : toWorkspaceDto(membership.workspace),
        currentUserWorkspace:
          membership === null
            ? null
            : { id: membership.userWorkspaceId, objectsPermissions },
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

  Object: {
    fieldsList: (object: { fields: unknown[] }) => object.fields,
    fields: (object: { fields: unknown[] }) => toConnection(object.fields),
    // Not modelled yet, but the front dereferences both unconditionally, so
    // they must be lists rather than null.
    searchFieldMetadataList: () => [],
    indexMetadataList: () => [],
    universalIdentifier: (object: { id: string }) => object.id,
    color: () => null,
    isRemote: () => false,
    isUIEditable: () => true,
    isUICreatable: () => true,
    writability: () => 'FULL_WRITE',
    openRecordIn: () => 'SIDE_PANEL',
    shortcut: () => null,
    isLabelSyncedWithName: () => false,
    applicationId: () => null,
    duplicateCriteria: () => null,
    createdAt: () => new Date().toISOString(),
    updatedAt: () => new Date().toISOString(),
  },

  Field: {
    universalIdentifier: (field: { id: string }) => field.id,
    isCustom: () => false,
    isUIEditable: () => true,
    isSearchable: () => false,
    writability: () => 'FULL_WRITE',
    isLabelSyncedWithName: () => false,
    morphId: () => null,
    applicationId: () => null,
    morphRelations: () => [],
    createdAt: () => new Date().toISOString(),
    updatedAt: () => new Date().toISOString(),
    relation: (field: {
      type: string;
      settings: { relationType?: string } | null;
      relationTargetObjectMetadataId: string | null;
    }) =>
      field.type !== 'RELATION' || field.relationTargetObjectMetadataId === null
        ? null
        : { type: field.settings?.relationType ?? null },
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

    createOneObject: async (
      _parent: unknown,
      args: {
        input: {
          nameSingular: string;
          namePlural: string;
          labelSingular: string;
          labelPlural: string;
          icon?: string;
          description?: string;
        };
      },
      context: MetadataContext,
    ) => {
      const workspaceId = await requireWorkspaceId(context);

      const object = await createObjectMetadata({
        client: context.client,
        workspaceId,
        input: args.input,
      });

      // A new object with no view never appears in the sidebar.
      await context.client.query(
        `INSERT INTO core."view" ("workspaceId","objectMetadataId","name","type","key","icon","position")
         VALUES ($1,$2,$3,'TABLE','INDEX',$4,0)`,
        [workspaceId, object.id, `All ${object.labelPlural}`, object.icon],
      );

      return object;
    },

    createOneField: async (
      _parent: unknown,
      args: {
        input: {
          objectMetadataId: string;
          name: string;
          label: string;
          type: string;
          isNullable?: boolean;
          icon?: string;
          options?: { value: string; label: string; color?: string }[];
        };
      },
      context: MetadataContext,
    ) => {
      const workspaceId = await requireWorkspaceId(context);
      const metadata = await loadMetadataForSession(context);
      const object = metadata.objects.find(
        (entry) => entry.id === args.input.objectMetadataId,
      );

      if (object === undefined) {
        throw new Error('OBJECT_NOT_FOUND');
      }

      return createFieldMetadata({
        client: context.client,
        workspaceId,
        object,
        input: {
          ...args.input,
          type: args.input.type as FieldMetadataType,
        },
      });
    },

    createView: async (
      _parent: unknown,
      args: {
        data: {
          objectMetadataId: string;
          name: string;
          type?: string;
          key?: string;
          icon?: string;
          position?: number;
        };
      },
      context: MetadataContext,
    ) => {
      const workspaceId = await requireWorkspaceId(context);

      const { rows } = await context.client.query(
        `INSERT INTO core."view"
           ("workspaceId","objectMetadataId","name","type","key","icon","position")
         VALUES ($1,$2,$3,COALESCE($4,'TABLE'),$5,$6,COALESCE($7,0))
         RETURNING "id","name","type","key","icon","position","objectMetadataId"`,
        [
          workspaceId,
          args.data.objectMetadataId,
          args.data.name,
          args.data.type ?? null,
          args.data.key ?? null,
          args.data.icon ?? null,
          args.data.position ?? null,
        ],
      );

      return rows[0];
    },

    updateView: async (
      _parent: unknown,
      args: {
        id: string;
        data: { name?: string; type?: string; icon?: string; position?: number };
      },
      context: MetadataContext,
    ) => {
      const workspaceId = await requireWorkspaceId(context);

      // COALESCE keeps every column the caller omitted, so a partial update
      // cannot blank the rest of the row.
      const { rows } = await context.client.query(
        `UPDATE core."view" SET
           "name" = COALESCE($3,"name"),
           "type" = COALESCE($4,"type"),
           "icon" = COALESCE($5,"icon"),
           "position" = COALESCE($6,"position"),
           "updatedAt" = now()
         WHERE "id" = $1 AND "workspaceId" = $2 AND "deletedAt" IS NULL
         RETURNING "id","name","type","key","icon","position","objectMetadataId"`,
        [
          args.id,
          workspaceId,
          args.data.name ?? null,
          args.data.type ?? null,
          args.data.icon ?? null,
          args.data.position ?? null,
        ],
      );

      return rows[0] ?? null;
    },

    deleteView: async (
      _parent: unknown,
      args: { id: string },
      context: MetadataContext,
    ) => {
      const workspaceId = await requireWorkspaceId(context);

      const { rows } = await context.client.query(
        `UPDATE core."view" SET "deletedAt" = now(), "updatedAt" = now()
         WHERE "id" = $1 AND "workspaceId" = $2 AND "deletedAt" IS NULL
         RETURNING "id","name","type","key","icon","position","objectMetadataId"`,
        [args.id, workspaceId],
      );

      return rows[0] ?? null;
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
