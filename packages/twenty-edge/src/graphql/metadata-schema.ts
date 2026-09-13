import { type Client } from 'pg';

import {
  findFirstWorkspaceForUser,
  type SessionContext,
  findUserByEmail,
  findUserById,
  insertUser,
  type UserRow,
} from 'src/db/core/auth-repository';
import { loadWorkspaceMetadata } from 'src/db/core/metadata-repository';
import {
  findWorkspaceMemberByUserId,
  findWorkspaceMembers,
  type WorkspaceMemberRow,
} from 'src/db/workspace/workspace-member-repository';
import { BOOT_SCHEMA_SDL } from 'src/graphql/boot-schema';
import { JSONScalar, SCALAR_SDL } from 'src/graphql/scalars';
import {
  bootstrapWorkspace,
  seedWorkspaceMember,
} from 'src/services/bootstrap-workspace';
import {
  createFieldMetadata,
  createObjectMetadata,
  deleteFieldMetadata,
  deleteObjectMetadata,
} from 'src/services/metadata-mutations';
import { type FieldMetadataType } from 'src/metadata/field-metadata-type';
import {
  type FlatFieldMetadata,
  type FlatObjectMetadata,
} from 'src/metadata/types';
import { hashPassword, verifyPassword } from 'src/auth/password';
import { issueLoginToken, verifyLoginToken } from 'src/auth/login-token';

export type MetadataContext = {
  client: Client;
  appSecret: string;
  // Loaded once per request by the route, so no resolver re-reads the user,
  // the membership or the workspace.
  sessionContext: SessionContext | null;
  serverUrl: string;
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
${BOOT_SCHEMA_SDL}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: Cursor
  endCursor: Cursor
}

# Every field below is requested by twenty-front's UserQueryFragment. GraphQL
# fails the whole document on a single unknown field, so a missing one here is
# not a missing feature — it is a blank app.
type User {
  id: UUID!
  firstName: String
  lastName: String
  email: String!
  locale: String
  hasPassword: Boolean!
  canAccessFullAdminPanel: Boolean!
  canImpersonate: Boolean!
  supportUserHash: String
  onboardingStatus: String
  previousOnboardingStatus: String
  isWorkspaceCreator: Boolean
  currentWorkspace: Workspace
  currentUserWorkspace: UserWorkspace
  workspaceMember: WorkspaceMember
  workspaceMembers: [WorkspaceMember!]!
  deletedWorkspaceMembers: [DeletedWorkspaceMember!]!
  availableWorkspaces: AvailableWorkspaces!
  userVars: RawJSON
}

type UserWorkspace {
  id: UUID!
  permissionFlags: [String!]
  isImpersonating: Boolean
  objectsPermissions: [ObjectPermission!]!
  twoFactorAuthenticationMethodSummary: [TwoFactorAuthenticationMethodSummary!]!
}

type TwoFactorAuthenticationMethodSummary {
  twoFactorAuthenticationMethodId: UUID!
  status: String!
  strategy: String!
}

type ObjectPermission {
  objectMetadataId: UUID!
  canReadObjectRecords: Boolean
  canUpdateObjectRecords: Boolean
  canSoftDeleteObjectRecords: Boolean
  canDestroyObjectRecords: Boolean
  restrictedFields: RawJSON
  rowLevelPermissionPredicates: [RowLevelPermissionPredicate!]
  rowLevelPermissionPredicateGroups: [RowLevelPermissionPredicateGroup!]
}

type RowLevelPermissionPredicate {
  id: UUID!
  fieldMetadataId: UUID
  objectMetadataId: UUID
  operand: String
  subFieldName: String
  workspaceMemberFieldMetadataId: UUID
  workspaceMemberSubFieldName: String
  rowLevelPermissionPredicateGroupId: UUID
  positionInRowLevelPermissionPredicateGroup: Float
  roleId: UUID
  value: RawJSON
}

type RowLevelPermissionPredicateGroup {
  id: UUID!
  parentRowLevelPermissionPredicateGroupId: UUID
  logicalOperator: String
  positionInRowLevelPermissionPredicateGroup: Float
  roleId: UUID
  objectMetadataId: UUID
}

type WorkspaceMember {
  id: UUID!
  name: FullNameOutput
  colorScheme: String
  uiScale: String
  openRecordIn: String
  avatarUrl: String
  locale: String
  userEmail: String
  userWorkspaceId: UUID
  timeZone: String
  dateFormat: String
  timeFormat: String
  calendarStartDay: Float
  numberFormat: String
}

type DeletedWorkspaceMember {
  id: UUID!
  name: FullNameOutput
  avatarUrl: String
  userEmail: String
}

type FullNameOutput { firstName: String lastName: String }

type Role {
  id: UUID!
  label: String!
  description: String
  icon: String
  canUpdateAllSettings: Boolean
  canAccessAllTools: Boolean
  isEditable: Boolean
  canReadAllObjectRecords: Boolean
  canUpdateAllObjectRecords: Boolean
  canSoftDeleteAllObjectRecords: Boolean
  canDestroyAllObjectRecords: Boolean
  canBeAssignedToUsers: Boolean
  canBeAssignedToAgents: Boolean
  canBeAssignedToApiKeys: Boolean
}

type FeatureFlag { key: String! value: Boolean! }
type BillingEntitlement { key: String! value: Boolean! }
type BillingCustomer { id: UUID! hasPaymentMethod: Boolean }
type WorkspaceCustomApplication { id: UUID! }

type InstalledApplication {
  id: UUID!
  name: String
  universalIdentifier: String
  logoUrl: String
}

type BillingSubscriptionSchedulePhaseItem { price: String quantity: Float }

type BillingSubscriptionSchedulePhase {
  start_date: Float
  end_date: Float
  items: [BillingSubscriptionSchedulePhaseItem!]
}

type BillingProductMetadata {
  productKey: String
  planKey: String
  priceUsageBased: String
  isLegacy: Boolean
}

type BillingProduct {
  name: String
  description: String
  images: [String!]
  metadata: BillingProductMetadata
}

type BillingSubscriptionItem {
  id: UUID!
  hasReachedCurrentPeriodCap: Boolean
  quantity: Float
  stripePriceId: String
  unitAmount: Float
  creditAmount: Float
  billingProduct: BillingProduct
}

type BillingSubscription {
  id: UUID!
  status: String
  interval: String
  metadata: RawJSON
  currentPeriodEnd: Float
  cancelAt: Float
  phases: [BillingSubscriptionSchedulePhase!]
  billingSubscriptionItems: [BillingSubscriptionItem!]
}

type Workspace {
  id: UUID!
  displayName: String
  logo: String
  subdomain: String!
  customDomain: String
  inviteHash: String
  allowImpersonation: Boolean
  activationStatus: String!
  metadataVersion: Int!
  isPublicInviteLinkEnabled: Boolean
  workspaceDiscoverability: String
  isGoogleAuthEnabled: Boolean
  isMicrosoftAuthEnabled: Boolean
  isPasswordAuthEnabled: Boolean
  isGoogleAuthBypassEnabled: Boolean
  isMicrosoftAuthBypassEnabled: Boolean
  isPasswordAuthBypassEnabled: Boolean
  hasValidSignedEnterpriseKey: Boolean
  hasValidEnterpriseValidityToken: Boolean
  workspaceCustomApplication: WorkspaceCustomApplication
  installedApplications: [InstalledApplication!]!
  isCustomDomainEnabled: Boolean
  workspaceUrls: WorkspaceUrls!
  featureFlags: [FeatureFlag!]!
  currentBillingSubscription: BillingSubscription
  billingCustomer: BillingCustomer
  billingSubscriptions: [BillingSubscription!]!
  billingEntitlements: [BillingEntitlement!]!
  workspaceMembersCount: Float
  defaultRole: Role
  aiChatModelTier: String
  aiAgentModelTier: String
  isAutoModelSelectionEnabled: Boolean
  aiModelIdByTier: RawJSON
  aiAdditionalInstructions: String
  isTwoFactorAuthenticationEnforced: Boolean
  trashRetentionDays: Float
  eventLogRetentionDays: Float
  editableProfileFields: [String!]
  isInternalMessagesImportEnabled: Boolean
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
  isCompact: Boolean
  kanbanAggregateOperation: String
  kanbanAggregateOperationFieldMetadataId: UUID
  mainGroupByFieldMetadataId: UUID
  shouldHideEmptyGroups: Boolean
  kanbanColumnWidth: Float
  anyFieldFilterValue: String
  calendarFieldMetadataId: UUID
  calendarEndFieldMetadataId: UUID
  calendarLayout: String
  visibility: String
  createdByUserWorkspaceId: UUID
  isActive: Boolean
  viewFields: [ViewField!]!
  viewFieldGroups: [ViewFieldGroup!]!
  viewFilters: [ViewFilter!]!
  viewFilterGroups: [ViewFilterGroup!]!
  viewSorts: [ViewSort!]!
  viewGroups: [ViewGroup!]!
}

type MinimalMetadata {
  objectMetadataItems: [Object!]!
  views: [View!]!
  collectionHashes: [CollectionHash!]!
}

type CollectionHash { collectionName: String! hash: String! }

type UserSession {
  id: UUID!
  workspaceId: UUID
  authProvider: String
  isImpersonating: Boolean
  userAgent: String
  ipAddress: String
  createdAt: DateTime
  lastActiveAt: DateTime
  expiresAt: DateTime
  isCurrent: Boolean
}

type AuthToken { token: String! expiresAt: DateTime! }

# Named exactly as twenty-front's fragments expect: AuthTokenPair carries
# accessOrWorkspaceAgnosticToken and refreshToken, not a loginToken.
type AuthTokenPair {
  accessOrWorkspaceAgnosticToken: AuthToken!
  refreshToken: AuthToken!
}

type LoginTokenWrapper { loginToken: AuthToken! }
type AuthTokensWrapper { tokens: AuthTokenPair! }

type WorkspaceUrls { subdomainUrl: String! customUrl: String }

type SsoIdentityProvider {
  id: UUID!
  name: String
  type: String
  status: String
  issuer: String
}

type AvailableWorkspace {
  id: UUID!
  displayName: String
  loginToken: String
  inviteHash: String
  personalInviteToken: String
  workspaceUrls: WorkspaceUrls!
  logo: String
  sso: [SsoIdentityProvider!]!
}

type AvailableWorkspaces {
  availableWorkspacesForSignIn: [AvailableWorkspace!]!
  availableWorkspacesForSignUp: [AvailableWorkspace!]!
}

type UserExists {
  exists: Boolean!
  availableWorkspacesCount: Int!
  isEmailVerified: Boolean!
}

type AuthProviders {
  sso: [SsoIdentityProvider!]!
  google: Boolean!
  magicLink: Boolean!
  password: Boolean!
  microsoft: Boolean!
}

type AuthBypassProviders {
  google: Boolean!
  password: Boolean!
  microsoft: Boolean!
}

type PublicWorkspaceData {
  id: UUID!
  logo: String
  displayName: String
  workspaceUrls: WorkspaceUrls!
  authProviders: AuthProviders!
  authBypassProviders: AuthBypassProviders!
}

type SignInUpOutput {
  availableWorkspaces: AvailableWorkspaces!
  tokens: AuthTokenPair!
}

type Query {
  currentUser: User
  checkUserExists(email: String!, captchaToken: String): UserExists!
  getPublicWorkspaceDataByDomain(origin: String!): PublicWorkspaceData!
  objects(paging: PagingInput): ObjectConnection!
  object(id: UUID!): Object
  fields(paging: PagingInput): FieldConnection!
  getViews(viewTypes: [ViewType!]): [View!]!
  getPageLayouts(pageLayoutType: PageLayoutType): [PageLayout!]!
  commandMenuItems: [CommandMenuItem!]!
  navigationMenuItems: [NavigationMenuItem!]!
  frontComponents: [FrontComponent!]!
  findManyLogicFunctions: [LogicFunction!]!
  minimalMetadata: MinimalMetadata!
  currentUserSessions: [UserSession!]!
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
  setWorkspaceCustomDomain(customDomain: String): Workspace!
  createOneObject(input: ObjectCreateInput!): Object!
  createOneField(input: FieldCreateInput!): Field!
  deleteOneObject(id: UUID!): Object
  deleteOneField(id: UUID!): Field
  createView(data: ViewCreateInput!): View!
  updateView(id: UUID!, data: ViewUpdateInput!): View
  deleteView(id: UUID!): View
  getLoginTokenFromCredentials(email: String!, password: String!, captchaToken: String, origin: String): LoginTokenWrapper!
  getAuthTokensFromLoginToken(loginToken: String!, origin: String): AuthTokensWrapper!
  signIn(email: String!, password: String!, captchaToken: String): SignInUpOutput!
  signUp(email: String!, password: String!, captchaToken: String, locale: String, verifyEmailRedirectPath: String, firstName: String, lastName: String, workspaceName: String): SignInUpOutput!
  signOut(refreshToken: String): Boolean!
  trackAnalytics(type: AnalyticsType!, event: String, name: String, properties: JSON): Analytics!
}
`;

// Single-workspace on a single host: the front redirects to subdomainUrl after
// login, so it has to be the server we are actually served from, not a
// subdomain that resolves nowhere.
const buildWorkspaceUrls = (
  workspace: { subdomain: string; customDomain: string | null },
  serverUrl: string,
) => ({
  subdomainUrl: serverUrl,
  customUrl: workspace.customDomain,
});

const toAvailableWorkspace = (
  workspace: {
    id: string;
    displayName: string | null;
    subdomain: string;
    customDomain: string | null;
  },
  loginToken: string | null,
  serverUrl: string,
) => ({
  id: workspace.id,
  displayName: workspace.displayName,
  loginToken,
  inviteHash: null,
  personalInviteToken: null,
  workspaceUrls: buildWorkspaceUrls(workspace, serverUrl),
  logo: null,
  sso: [],
});

// The front always reads both token slots off AuthTokenPair. We issue one
// opaque session cookie instead of a token pair, so the same short-lived token
// fills both rather than inventing a second one the server would never accept.
const toAuthTokenPair = (loginToken: { token: string; expiresAt: string }) => ({
  accessOrWorkspaceAgnosticToken: loginToken,
  refreshToken: loginToken,
});

// twenty-front reads relation.targetObjectMetadata.nameSingular without a null
// guard, so a relation field must either resolve its refs or report no relation
// at all — a half-filled one crashes the app on the first record page.
type RelationRef = {
  type: string | null;
  sourceObjectMetadata: { id: string; nameSingular: string; namePlural: string };
  targetObjectMetadata: { id: string; nameSingular: string; namePlural: string };
  sourceFieldMetadata: { id: string; name: string };
  targetFieldMetadata: { id: string; name: string };
};

type FieldWithRelation = FlatFieldMetadata & { relation: RelationRef | null };

const withRelationRefs = (objects: FlatObjectMetadata[]) => {
  const objectById = new Map(objects.map((object) => [object.id, object]));

  const toObjectRef = (object: FlatObjectMetadata) => ({
    id: object.id,
    nameSingular: object.nameSingular,
    namePlural: object.namePlural,
  });

  return objects.map((object) => ({
    ...object,
    fields: object.fields.flatMap((field): FieldWithRelation[] => {
      if (
        field.type !== 'RELATION' ||
        field.relationTargetObjectMetadataId === null
      ) {
        return [{ ...field, relation: null }];
      }

      const targetObject = objectById.get(field.relationTargetObjectMetadataId);
      const targetField = targetObject?.fields.find(
        (candidate) => candidate.id === field.relationTargetFieldMetadataId,
      );

      // A relation the front cannot model is not advertised at all. Sending it
      // with a null relation crashes the record page instead of degrading: the
      // front throws "Target object metadata item not found".
      if (targetObject === undefined || targetField === undefined) {
        return [];
      }

      return [
        {
          ...field,
          relation: {
            type: field.settings?.relationType ?? null,
            sourceObjectMetadata: toObjectRef(object),
            targetObjectMetadata: toObjectRef(targetObject),
            sourceFieldMetadata: { id: field.id, name: field.name },
            targetFieldMetadata: { id: targetField.id, name: targetField.name },
          },
        },
      ];
    }),
  }));
};

// There is no viewField table yet, so a view's columns are derived from the
// object's own fields. The id has to be stable across requests — the front keys
// its store by it — which rules out a random UUID.
const deriveStableId = (left: string, right: string): string => {
  const leftHex = left.replace(/-/g, '');
  const rightHex = right.replace(/-/g, '');
  const mixed = Array.from(
    leftHex,
    (character, index) =>
      (
        (parseInt(character, 16) ^ parseInt(rightHex[index] ?? '0', 16)) &
        0xf
      ).toString(16),
  ).join('');

  return [
    mixed.slice(0, 8),
    mixed.slice(8, 12),
    mixed.slice(12, 16),
    mixed.slice(16, 20),
    mixed.slice(20, 32),
  ].join('-');
};

const VISIBLE_VIEW_FIELD_COUNT = 8;

const buildViewFields = (
  viewId: string,
  object: FlatObjectMetadata | undefined,
) => {
  if (object === undefined) {
    return [];
  }

  const fields = object.fields.filter(
    (field) => field.isActive && !field.isSystem,
  );

  // The label identifier leads the table; Twenty renders it as the record chip.
  const ordered = [
    ...fields.filter(
      (field) => field.id === object.labelIdentifierFieldMetadataId,
    ),
    ...fields.filter(
      (field) => field.id !== object.labelIdentifierFieldMetadataId,
    ),
  ];

  return ordered.map((field, index) => ({
    id: deriveStableId(viewId, field.id),
    fieldMetadataId: field.id,
    viewId,
    isVisible: index < VISIBLE_VIEW_FIELD_COUNT,
    position: index,
    size: 150,
    aggregateOperation: null,
    viewFieldGroupId: null,
    isActive: true,
    createdAt: null,
    updatedAt: null,
    deletedAt: null,
  }));
};

type ViewRow = {
  id: string;
  name: string;
  type: string;
  key: string | null;
  icon: string | null;
  position: number;
  objectMetadataId: string;
  isCompact?: boolean;
};

const toViewDto = (view: ViewRow, object: FlatObjectMetadata | undefined) => ({
  ...view,
  isCompact: view.isCompact ?? false,
  kanbanAggregateOperation: null,
  kanbanAggregateOperationFieldMetadataId: null,
  mainGroupByFieldMetadataId: null,
  shouldHideEmptyGroups: false,
  kanbanColumnWidth: null,
  anyFieldFilterValue: null,
  calendarFieldMetadataId: null,
  calendarEndFieldMetadataId: null,
  calendarLayout: null,
  visibility: 'WORKSPACE',
  createdByUserWorkspaceId: null,
  isActive: true,
  viewFields: buildViewFields(view.id, object),
  viewFieldGroups: [],
  viewFilters: [],
  viewFilterGroups: [],
  viewSorts: [],
  viewGroups: [],
});

const toWorkspaceMemberDto = (member: WorkspaceMemberRow) => ({
  id: member.id,
  name: { firstName: member.nameFirstName, lastName: member.nameLastName },
  colorScheme: member.colorScheme ?? 'System',
  uiScale: 'Normal',
  openRecordIn: 'SIDE_PANEL',
  avatarUrl: member.avatarUrl,
  locale: member.locale ?? 'pt-BR',
  userEmail: member.userEmail,
  userWorkspaceId: null,
  timeZone: 'America/Sao_Paulo',
  dateFormat: 'SYSTEM',
  timeFormat: 'SYSTEM',
  calendarStartDay: 0,
  numberFormat: 'SYSTEM',
});

// Everything the front reads off currentWorkspace, with the features we do not
// run yet answered rather than omitted — an absent field fails the document.
const toWorkspaceDto = (
  workspace: {
    id: string;
    displayName: string | null;
    subdomain: string;
    customDomain: string | null;
    activationStatus: string;
    metadataVersion: number;
  },
  serverUrl: string,
) => ({
  ...workspace,
  logo: null,
  inviteHash: null,
  allowImpersonation: false,
  isPublicInviteLinkEnabled: false,
  workspaceDiscoverability: 'INVITE_ONLY',
  isGoogleAuthEnabled: false,
  isMicrosoftAuthEnabled: false,
  isPasswordAuthEnabled: true,
  isGoogleAuthBypassEnabled: false,
  isMicrosoftAuthBypassEnabled: false,
  isPasswordAuthBypassEnabled: false,
  hasValidSignedEnterpriseKey: false,
  hasValidEnterpriseValidityToken: false,
  workspaceCustomApplication: null,
  installedApplications: [],
  isCustomDomainEnabled: workspace.customDomain !== null,
  workspaceUrls: buildWorkspaceUrls(workspace, serverUrl),
  featureFlags: [],
  currentBillingSubscription: null,
  billingCustomer: null,
  billingSubscriptions: [],
  billingEntitlements: [],
  workspaceMembersCount: 1,
  defaultRole: null,
  aiChatModelTier: null,
  aiAgentModelTier: null,
  isAutoModelSelectionEnabled: false,
  aiModelIdByTier: null,
  aiAdditionalInstructions: null,
  isTwoFactorAuthenticationEnforced: false,
  trashRetentionDays: 30,
  eventLogRetentionDays: 90,
  editableProfileFields: [],
  isInternalMessagesImportEnabled: false,
});

const requireAuthenticatedUser = (context: MetadataContext): UserRow => {
  if (context.sessionContext === null) {
    throw new Error('UNAUTHENTICATED');
  }

  return context.sessionContext.user;
};

const requireMembership = (context: MetadataContext) => {
  const membership = context.sessionContext?.membership ?? null;

  if (membership === null) {
    throw new Error('NO_WORKSPACE');
  }

  return membership;
};

const requireWorkspaceId = (context: MetadataContext): string =>
  requireMembership(context).workspace.id;

const loadMetadataForSession = async (context: MetadataContext) => {
  const membership = requireMembership(context);

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
  JSON: JSONScalar,

  Query: {
    currentUser: async (_parent: unknown, _args: unknown, context: MetadataContext) => {
      if (context.sessionContext === null) {
        return null;
      }

      const { user, membership } = context.sessionContext;

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
              // The front runs Object.entries on restrictedFields without a
              // guard, so null here crashes the app after a successful login.
              restrictedFields: {},
              rowLevelPermissionPredicates: [],
              rowLevelPermissionPredicateGroups: [],
            }));

      const workspaceMember =
        membership === null
          ? null
          : await findWorkspaceMemberByUserId({
              client: context.client,
              workspaceId: membership.workspace.id,
              userId: user.id,
            });

      const workspaceMembers =
        membership === null
          ? []
          : await findWorkspaceMembers({
              client: context.client,
              workspaceId: membership.workspace.id,
            });

      const availableWorkspace =
        membership === null
          ? null
          : toAvailableWorkspace(membership.workspace, null, context.serverUrl);

      return {
        ...user,
        hasPassword: true,
        canAccessFullAdminPanel: false,
        canImpersonate: false,
        supportUserHash: null,
        // Anything short of COMPLETED sends the front into an onboarding flow
        // we do not serve, so it would never reach the app.
        onboardingStatus: 'COMPLETED',
        previousOnboardingStatus: 'COMPLETED',
        isWorkspaceCreator: true,
        currentWorkspace:
          membership === null
            ? null
            : toWorkspaceDto(membership.workspace, context.serverUrl),
        currentUserWorkspace:
          membership === null
            ? null
            : {
                id: membership.userWorkspaceId,
                permissionFlags: [],
                isImpersonating: false,
                objectsPermissions,
                twoFactorAuthenticationMethodSummary: [],
              },
        workspaceMember:
          workspaceMember === null ? null : toWorkspaceMemberDto(workspaceMember),
        workspaceMembers: workspaceMembers.map(toWorkspaceMemberDto),
        deletedWorkspaceMembers: [],
        availableWorkspaces: {
          availableWorkspacesForSignIn:
            availableWorkspace === null ? [] : [availableWorkspace],
          availableWorkspacesForSignUp: [],
        },
        userVars: {},
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

      if (user === null) {
        return {
          exists: false,
          availableWorkspacesCount: 0,
          isEmailVerified: false,
        };
      }

      const membership = await findFirstWorkspaceForUser({
        client: context.client,
        userId: user.id,
      });

      return {
        exists: true,
        availableWorkspacesCount: membership === null ? 0 : 1,
        isEmailVerified: user.isEmailVerified,
      };
    },

    getPublicWorkspaceDataByDomain: async (
      _parent: unknown,
      _args: { origin: string },
      context: MetadataContext,
    ) => {
      const { rows } = await context.client.query<{
        id: string;
        displayName: string | null;
        subdomain: string;
        customDomain: string | null;
      }>(
        `SELECT "id","displayName","subdomain","customDomain" FROM core."workspace"
         WHERE "deletedAt" IS NULL AND "activationStatus" = 'ACTIVE'
         ORDER BY "createdAt" ASC LIMIT 1`,
      );

      const workspace = rows[0];

      if (workspace === undefined) {
        throw new Error('WORKSPACE_NOT_FOUND');
      }

      return {
        id: workspace.id,
        logo: null,
        displayName: workspace.displayName,
        workspaceUrls: buildWorkspaceUrls(workspace, context.serverUrl),
        authProviders: {
          sso: [],
          google: false,
          magicLink: false,
          password: true,
          microsoft: false,
        },
        authBypassProviders: {
          google: false,
          password: false,
          microsoft: false,
        },
      };
    },

    objects: async (_parent: unknown, _args: unknown, context: MetadataContext) => {
      const metadata = await loadMetadataForSession(context);

      return toConnection(withRelationRefs(metadata.objects));
    },

    object: async (
      _parent: unknown,
      args: { id: string },
      context: MetadataContext,
    ) => {
      const metadata = await loadMetadataForSession(context);

      return (
        withRelationRefs(metadata.objects).find(
          (object) => object.id === args.id,
        ) ?? null
      );
    },

    fields: async (_parent: unknown, _args: unknown, context: MetadataContext) => {
      const metadata = await loadMetadataForSession(context);

      return toConnection(
        withRelationRefs(metadata.objects).flatMap((object) => object.fields),
      );
    },

    getViews: async (
      _parent: unknown,
      args: { viewTypes?: string[] },
      context: MetadataContext,
    ) => {
      const membership = context.sessionContext?.membership ?? null;

      if (membership === null) {
        return [];
      }

      const { rows } = await context.client.query<ViewRow>(
        `SELECT "id","name","type","key","icon","position","objectMetadataId","isCompact"
         FROM core."view"
         WHERE "workspaceId" = $1 AND "deletedAt" IS NULL
           AND ($2::text[] IS NULL OR "type" = ANY($2))
         ORDER BY "position" ASC`,
        [membership.workspace.id, args.viewTypes ?? null],
      );

      const metadata = await loadWorkspaceMetadata({
        client: context.client,
        workspaceId: membership.workspace.id,
        metadataVersion: membership.workspace.metadataVersion,
      });

      const objectById = new Map(
        metadata.objects.map((object) => [object.id, object]),
      );

      return rows.map((view) =>
        toViewDto(view, objectById.get(view.objectMetadataId)),
      );
    },

    // The sidebar is built entirely from these. With none, the app signs in to
    // an empty shell — which is exactly what a phone shows, since it has no
    // record URL to fall back on the way a desktop tab does.
    navigationMenuItems: async (
      _parent: unknown,
      _args: unknown,
      context: MetadataContext,
    ) => {
      const membership = context.sessionContext?.membership ?? null;

      if (membership === null) {
        return [];
      }

      const metadata = await loadWorkspaceMetadata({
        client: context.client,
        workspaceId: membership.workspace.id,
        metadataVersion: membership.workspace.metadataVersion,
      });

      const { rows } = await context.client.query<ViewRow>(
        `SELECT "id","name","type","key","icon","position","objectMetadataId","isCompact"
         FROM core."view"
         WHERE "workspaceId" = $1 AND "deletedAt" IS NULL AND "type" = 'TABLE'
         ORDER BY "position" ASC`,
        [membership.workspace.id],
      );

      const objectById = new Map(
        metadata.objects.map((object) => [object.id, object]),
      );

      return rows
        .map((view) => ({ view, object: objectById.get(view.objectMetadataId) }))
        .filter(
          (entry): entry is { view: ViewRow; object: FlatObjectMetadata } =>
            entry.object !== undefined &&
            entry.object.isActive &&
            !entry.object.isSystem,
        )
        .sort((left, right) =>
          left.object.labelPlural.localeCompare(right.object.labelPlural),
        )
        .map(({ view, object }, index) => ({
          id: deriveStableId(view.id, membership.workspace.id),
          type: 'VIEW',
          userWorkspaceId: membership.userWorkspaceId,
          targetRecordId: null,
          targetObjectMetadataId: object.id,
          viewId: view.id,
          folderId: null,
          name: object.labelPlural,
          link: null,
          icon: object.icon,
          color: null,
          pageLayoutId: null,
          position: index,
          applicationId: null,
          createdAt: null,
          updatedAt: null,
          targetRecordIdentifier: null,
        }));
    },

    // Collections the front loads at boot but we do not serve yet. They answer
    // empty rather than erroring: an unresolved field would fail the whole
    // document and leave the app on its loading skeleton.
    getPageLayouts: () => [],
    commandMenuItems: () => [],
    frontComponents: () => [],
    findManyLogicFunctions: () => [],

    currentUserSessions: async (
      _parent: unknown,
      _args: unknown,
      context: MetadataContext,
    ) => {
      if (context.sessionContext === null) {
        return [];
      }

      const { rows } = await context.client.query<{
        id: string;
        workspaceId: string | null;
        authProvider: string;
        isImpersonating: boolean;
        userAgent: string | null;
        ipAddress: string | null;
        createdAt: Date;
        lastActiveAt: Date;
        expiresAt: Date;
      }>(
        `SELECT "id","workspaceId","authProvider","isImpersonating","userAgent",
                "ipAddress","createdAt","lastActiveAt","expiresAt"
         FROM core."userSession"
         WHERE "userId" = $1 AND "revokedAt" IS NULL AND "expiresAt" > now()
         ORDER BY "lastActiveAt" DESC
         LIMIT 50`,
        [context.sessionContext.user.id],
      );

      const currentSessionId = context.sessionContext.session.id;

      return rows.map((row) => ({
        ...row,
        isCurrent: row.id === currentSessionId,
      }));
    },

    minimalMetadata: async (
      _parent: unknown,
      _args: unknown,
      context: MetadataContext,
    ) => {
      const metadata = await loadMetadataForSession(context);

      const { rows } = await context.client.query<ViewRow>(
        `SELECT "id","name","type","key","icon","position","objectMetadataId","isCompact"
         FROM core."view" WHERE "workspaceId" = $1 AND "deletedAt" IS NULL`,
        [metadata.workspaceId],
      );

      const objectById = new Map(
        metadata.objects.map((object) => [object.id, object]),
      );

      const views = rows.map((view) =>
        toViewDto(view, objectById.get(view.objectMetadataId)),
      );

      return {
        objectMetadataItems: withRelationRefs(metadata.objects),
        views,
        collectionHashes: [
          { collectionName: 'objectMetadata', hash: hashCollection(metadata.objects) },
          { collectionName: 'view', hash: hashCollection(views) },
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
    relation: (field: { relation?: unknown }) => field.relation ?? null,
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

      return { tokens: toAuthTokenPair(loginToken) };
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

      const available =
        membership === null
          ? []
          : [
              toAvailableWorkspace(
                membership.workspace,
                loginToken.token,
                context.serverUrl,
              ),
            ];

      return {
        availableWorkspaces: {
          availableWorkspacesForSignIn: available,
          availableWorkspacesForSignUp: [],
        },
        tokens: toAuthTokenPair(loginToken),
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

      const loginToken = await issueLoginToken({
        appSecret: context.appSecret,
        userId: user.id,
      });

      const available =
        membership === null
          ? []
          : [
              toAvailableWorkspace(
                membership.workspace,
                loginToken.token,
                context.serverUrl,
              ),
            ];

      return {
        availableWorkspaces: {
          availableWorkspacesForSignIn: available,
          availableWorkspacesForSignUp: [],
        },
        tokens: toAuthTokenPair(loginToken),
      };
    },

    // Whitelabel: point a workspace at its own hostname. The DNS record and the
    // Worker route are provisioned outside this call; this only records which
    // workspace the Host header should resolve to.
    setWorkspaceCustomDomain: async (
      _parent: unknown,
      args: { customDomain: string | null },
      context: MetadataContext,
    ) => {
      const workspaceId = await requireWorkspaceId(context);
      const customDomain =
        args.customDomain === null || args.customDomain.trim().length === 0
          ? null
          : args.customDomain.trim().toLowerCase();

      if (
        customDomain !== null &&
        !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(
          customDomain,
        )
      ) {
        throw new Error('INVALID_CUSTOM_DOMAIN');
      }

      const { rows } = await context.client.query(
        `UPDATE core."workspace" SET "customDomain" = $2, "updatedAt" = now()
         WHERE "id" = $1
         RETURNING "id","displayName","subdomain","customDomain","activationStatus","metadataVersion"`,
        [workspaceId, customDomain],
      );

      return rows[0];
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

    deleteOneObject: async (
      _parent: unknown,
      args: { id: string },
      context: MetadataContext,
    ) => {
      const workspaceId = requireWorkspaceId(context);
      const metadata = await loadMetadataForSession(context);
      const object = metadata.objects.find((entry) => entry.id === args.id);

      if (object === undefined) {
        throw new Error('OBJECT_NOT_FOUND');
      }

      return deleteObjectMetadata({
        client: context.client,
        workspaceId,
        object,
      });
    },

    deleteOneField: async (
      _parent: unknown,
      args: { id: string },
      context: MetadataContext,
    ) => {
      const workspaceId = requireWorkspaceId(context);
      const metadata = await loadMetadataForSession(context);
      const object = metadata.objects.find((entry) =>
        entry.fields.some((field) => field.id === args.id),
      );
      const field = object?.fields.find((entry) => entry.id === args.id);

      if (object === undefined || field === undefined) {
        throw new Error('FIELD_NOT_FOUND');
      }

      return deleteFieldMetadata({
        client: context.client,
        workspaceId,
        object,
        field,
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

    // Accepted and dropped: we keep no analytics pipeline, and the front only
    // reads `success`.
    trackAnalytics: () => ({ success: true }),

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
