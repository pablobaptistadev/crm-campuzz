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
  findViews,
  loadViewChildren,
  seedViewFields,
  type ViewChildren,
  type ViewFieldRow,
  type ViewFilterRow,
  type ViewRow,
} from 'src/db/core/view-repository';
import {
  createViewFilter,
  createViewFilterGroup,
  createViewFields,
  createViewGroups,
  createViewSort,
  destroyView,
  destroyViewChild,
  insertView,
  softDeleteView,
  softDeleteViewChild,
  updateViewField,
  updateViewFilter,
  updateViewFilterGroup,
  updateViewGroups,
  updateViewSettings,
  updateViewSort,
  type CreateViewFieldInput as CreateViewFieldArgs,
  type CreateViewFilterInput as CreateViewFilterArgs,
  type ViewSettingsInput,
} from 'src/services/view-mutations';
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
import { issueUploadToken } from 'src/auth/upload-token';
import { insertFile, markFileUploaded } from 'src/db/core/file-repository';
import {
  findRoles,
  loadRolePermissions,
} from 'src/db/core/role-repository';
import { loadWorkspacePermissions } from 'src/services/permissions';
import {
  assignRoleToWorkspaceMember,
  createRole,
  deleteRole,
  updateRole,
  upsertFieldPermissions,
  upsertObjectPermissions,
  upsertPermissionFlags,
} from 'src/services/role-mutations';
import { syncStandardMetadata } from 'src/services/sync-standard-metadata';
import {
  orderedVisibleFields,
  VISIBLE_VIEW_FIELD_COUNT,
} from 'src/services/bootstrap-workspace';

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
  roles: [Role!]
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
  workspaceMembers: [WorkspaceMember!]!
  agents: [Agent!]!
  apiKeys: [ApiKeyForRole!]!
  permissionFlags: [RolePermissionFlag!]!
  objectPermissions: [ObjectPermission!]!
  fieldPermissions: [FieldPermission!]!
  rowLevelPermissionPredicates: [RowLevelPermissionPredicate!]!
  rowLevelPermissionPredicateGroups: [RowLevelPermissionPredicateGroup!]!
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
  timelineActivityTypes: [TimelineActivityType!]!
  myConnectedAccounts: [ConnectedAccount!]!
  myMessageChannels(connectedAccountId: UUID): [MessageChannel!]!
  myCalendarChannels(connectedAccountId: UUID): [CalendarChannel!]!
  getRoles: [Role!]!
}

type RolePermissionFlag {
  id: UUID!
  flag: String!
  roleId: UUID!
}

type FieldPermission {
  id: UUID!
  roleId: UUID!
  objectMetadataId: UUID!
  fieldMetadataId: UUID!
  canReadFieldValue: Boolean
  canUpdateFieldValue: Boolean
}

# We run no agents, but the settings page asks a role for them and one unknown
# field fails the whole document.
type Agent {
  id: UUID!
  name: String
  label: String
  description: String
  icon: String
  prompt: String
  modelId: String
  responseFormat: RawJSON
  roleId: UUID
  isCustom: Boolean
  modelConfiguration: RawJSON
  evaluationInputs: RawJSON
  applicationId: UUID
  createdAt: DateTime
  updatedAt: DateTime
}

type ApiKeyForRole {
  id: UUID!
  name: String!
  expiresAt: DateTime
  revokedAt: DateTime
}

input CreateRoleInput {
  label: String!
  description: String
  icon: String
  canReadAllObjectRecords: Boolean
  canUpdateAllObjectRecords: Boolean
  canSoftDeleteAllObjectRecords: Boolean
  canDestroyAllObjectRecords: Boolean
  canUpdateAllSettings: Boolean
  canAccessAllTools: Boolean
  canBeAssignedToUsers: Boolean
  canBeAssignedToAgents: Boolean
  canBeAssignedToApiKeys: Boolean
}

input UpdateRoleInput {
  id: UUID!
  update: UpdateRolePayload!
}

input UpdateRolePayload {
  label: String
  description: String
  icon: String
  canReadAllObjectRecords: Boolean
  canUpdateAllObjectRecords: Boolean
  canSoftDeleteAllObjectRecords: Boolean
  canDestroyAllObjectRecords: Boolean
  canUpdateAllSettings: Boolean
  canAccessAllTools: Boolean
  canBeAssignedToUsers: Boolean
  canBeAssignedToAgents: Boolean
  canBeAssignedToApiKeys: Boolean
}

input ObjectPermissionInput {
  objectMetadataId: UUID!
  canReadObjectRecords: Boolean
  canUpdateObjectRecords: Boolean
  canSoftDeleteObjectRecords: Boolean
  canDestroyObjectRecords: Boolean
}

input UpsertObjectPermissionsInput {
  roleId: UUID!
  objectPermissions: [ObjectPermissionInput!]!
}

input FieldPermissionInput {
  objectMetadataId: UUID!
  fieldMetadataId: UUID!
  canReadFieldValue: Boolean
  canUpdateFieldValue: Boolean
}

input UpsertFieldPermissionsInput {
  roleId: UUID!
  fieldPermissions: [FieldPermissionInput!]!
}

input UpsertPermissionFlagsInput {
  roleId: UUID!
  permissionFlagKeys: [String!]!
}

type MessageChannel {
  id: UUID!
  handle: String!
  displayName: String
  visibility: String
  type: String
  isContactAutoCreationEnabled: Boolean
  contactAutoCreationPolicy: String
  messageFolderImportPolicy: String
  excludeNonProfessionalEmails: Boolean
  excludeGroupEmails: Boolean
  isSyncEnabled: Boolean
  syncStatus: String
  syncStage: String
  syncStageStartedAt: DateTime
  connectedAccountId: UUID
  connectedAccount: ConnectedAccount
  createdAt: DateTime!
  updatedAt: DateTime!
}

type CalendarChannel {
  id: UUID!
  handle: String!
  visibility: String
  syncStatus: String
  syncStage: String
  syncStageStartedAt: DateTime
  isContactAutoCreationEnabled: Boolean
  contactAutoCreationPolicy: String
  isSyncEnabled: Boolean
  connectedAccountId: UUID
  createdAt: DateTime!
  updatedAt: DateTime!
}

type TimelineActivityTypeEmit {
  on: String
  objectUniversalIdentifier: UUID
}

type TimelineActivityType {
  id: UUID!
  applicationId: UUID
  universalIdentifier: String!
  name: String!
  label: String!
  icon: String
  emit: TimelineActivityTypeEmit
  frontComponentUniversalIdentifier: String
  isActive: Boolean!
}

type ConnectionParametersEndpoint {
  host: String!
  port: Int
  connectionSecurity: String
  username: String
}

type ConnectionParameters {
  IMAP: ConnectionParametersEndpoint
  SMTP: ConnectionParametersEndpoint
  CALDAV: ConnectionParametersEndpoint
}

type ConnectedAccount {
  id: UUID!
  handle: String!
  provider: String!
  authFailedAt: DateTime
  authFailedReason: String
  archivedAt: DateTime
  scopes: [String!]
  handleAliases: [String!]
  lastSignedInAt: DateTime
  userWorkspaceId: UUID
  connectionProviderId: String
  name: String
  visibility: String
  lastCredentialsRefreshedAt: DateTime
  connectionParameters: ConnectionParameters
  createdAt: DateTime!
  updatedAt: DateTime!
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

# Shapes copied from twenty-front's generated inputs: the front types its
# variables against these names, so a divergence here fails the document.
input CreateViewInput {
  id: UUID
  objectMetadataId: UUID!
  name: String!
  icon: String!
  type: ViewType
  key: String
  position: Float
  isCompact: Boolean
  kanbanAggregateOperation: String
  kanbanAggregateOperationFieldMetadataId: UUID
  kanbanColumnWidth: Int
  mainGroupByFieldMetadataId: UUID
  shouldHideEmptyGroups: Boolean
  anyFieldFilterValue: String
  calendarFieldMetadataId: UUID
  calendarEndFieldMetadataId: UUID
  calendarLayout: String
  openRecordIn: String
  visibility: String
}

input UpdateViewInput {
  id: UUID
  name: String
  icon: String
  type: ViewType
  position: Float
  isCompact: Boolean
  kanbanAggregateOperation: String
  kanbanAggregateOperationFieldMetadataId: UUID
  kanbanColumnWidth: Int
  mainGroupByFieldMetadataId: UUID
  shouldHideEmptyGroups: Boolean
  anyFieldFilterValue: String
  calendarFieldMetadataId: UUID
  calendarEndFieldMetadataId: UUID
  calendarLayout: String
  openRecordIn: String
  visibility: String
}

input CreateViewFieldInput {
  id: UUID
  viewId: UUID!
  fieldMetadataId: UUID!
  isVisible: Boolean
  position: Float
  size: Float
  aggregateOperation: String
  viewFieldGroupId: UUID
}

input UpdateViewFieldInputUpdates {
  isVisible: Boolean
  position: Float
  size: Float
  aggregateOperation: String
  viewFieldGroupId: UUID
}

input UpdateViewFieldInput { id: UUID! update: UpdateViewFieldInputUpdates! }
input DeleteViewFieldInput { id: UUID! }
input DestroyViewFieldInput { id: UUID! }

input CreateViewFilterInput {
  id: UUID
  viewId: UUID!
  fieldMetadataId: UUID!
  operand: String
  value: JSON!
  viewFilterGroupId: UUID
  positionInViewFilterGroup: Float
  subFieldName: String
  relationTargetFieldMetadataId: UUID
}

input UpdateViewFilterInputUpdates {
  fieldMetadataId: UUID
  operand: String
  value: JSON
  viewFilterGroupId: UUID
  positionInViewFilterGroup: Float
  subFieldName: String
  relationTargetFieldMetadataId: UUID
}

input UpdateViewFilterInput { id: UUID! update: UpdateViewFilterInputUpdates! }
input DeleteViewFilterInput { id: UUID! }
input DestroyViewFilterInput { id: UUID! }

input CreateViewSortInput {
  id: UUID
  viewId: UUID!
  fieldMetadataId: UUID!
  direction: String
  subFieldName: String
}

input UpdateViewSortInputUpdates { direction: String subFieldName: String }
input UpdateViewSortInput { id: UUID! update: UpdateViewSortInputUpdates! }
input DeleteViewSortInput { id: UUID! }
input DestroyViewSortInput { id: UUID! }

input CreateViewGroupInput {
  id: UUID
  viewId: UUID!
  fieldValue: String!
  isVisible: Boolean
  position: Float
}

input UpdateViewGroupInputUpdates {
  fieldValue: String
  isVisible: Boolean
  position: Float
}

input UpdateViewGroupInput { id: UUID! update: UpdateViewGroupInputUpdates! }
input DeleteViewGroupInput { id: UUID! }
input DestroyViewGroupInput { id: UUID! }

input CreateViewFilterGroupInput {
  id: UUID
  viewId: UUID!
  parentViewFilterGroupId: UUID
  logicalOperator: String
  positionInViewFilterGroup: Float
}

input UpdateViewFilterGroupInput {
  id: UUID!
  viewId: UUID
  parentViewFilterGroupId: UUID
  logicalOperator: String
  positionInViewFilterGroup: Float
}

type Mutation {
  setWorkspaceCustomDomain(customDomain: String): Workspace!
  createOneObject(input: ObjectCreateInput!): Object!
  createOneField(input: FieldCreateInput!): Field!
  deleteOneObject(id: UUID!): Object
  deleteOneField(id: UUID!): Field
  createView(input: CreateViewInput!): View!
  updateView(id: String!, input: UpdateViewInput!): View!
  deleteView(id: String!): View!
  destroyView(id: String!): Boolean!
  createManyViewFields(inputs: [CreateViewFieldInput!]!): [ViewField!]!
  updateViewField(input: UpdateViewFieldInput!): ViewField!
  deleteViewField(input: DeleteViewFieldInput!): ViewField!
  destroyViewField(input: DestroyViewFieldInput!): ViewField!
  createViewFilter(input: CreateViewFilterInput!): ViewFilter!
  updateViewFilter(input: UpdateViewFilterInput!): ViewFilter!
  deleteViewFilter(input: DeleteViewFilterInput!): ViewFilter!
  destroyViewFilter(input: DestroyViewFilterInput!): ViewFilter!
  createViewSort(input: CreateViewSortInput!): ViewSort!
  updateViewSort(input: UpdateViewSortInput!): ViewSort!
  deleteViewSort(input: DeleteViewSortInput!): Boolean!
  destroyViewSort(input: DestroyViewSortInput!): Boolean!
  createManyViewGroups(inputs: [CreateViewGroupInput!]!): [ViewGroup!]!
  updateManyViewGroups(inputs: [UpdateViewGroupInput!]!): [ViewGroup!]!
  createViewFilterGroup(input: CreateViewFilterGroupInput!): ViewFilterGroup!
  updateViewFilterGroup(input: UpdateViewFilterGroupInput!): ViewFilterGroup!
  destroyViewFilterGroup(id: String!): Boolean!
  getLoginTokenFromCredentials(email: String!, password: String!, captchaToken: String, origin: String): LoginTokenWrapper!
  getAuthTokensFromLoginToken(loginToken: String!, origin: String): AuthTokensWrapper!
  signIn(email: String!, password: String!, captchaToken: String): SignInUpOutput!
  signUp(email: String!, password: String!, captchaToken: String, locale: String, verifyEmailRedirectPath: String, firstName: String, lastName: String, workspaceName: String): SignInUpOutput!
  signOut(refreshToken: String): Boolean!
  trackAnalytics(type: AnalyticsType!, event: String, name: String, properties: JSON): Analytics!
  createFileUpload(filename: String!, size: Float!, fileFolder: FileFolder!, fieldMetadataId: String): FileUploadTarget!
  completeFileUpload(fileId: String!): FileWithSignedUrl!
  syncStandardMetadata: SyncStandardMetadataResult!
  createOneRole(createRoleInput: CreateRoleInput!): Role!
  updateOneRole(updateRoleInput: UpdateRoleInput!): Role!
  deleteOneRole(roleId: UUID!): UUID!
  updateWorkspaceMemberRole(workspaceMemberId: UUID!, roleId: UUID!): WorkspaceMember!
  upsertObjectPermissions(upsertObjectPermissionsInput: UpsertObjectPermissionsInput!): [ObjectPermission!]!
  upsertFieldPermissions(upsertFieldPermissionsInput: UpsertFieldPermissionsInput!): [FieldPermission!]!
  upsertPermissionFlags(upsertPermissionFlagsInput: UpsertPermissionFlagsInput!): [RolePermissionFlag!]!
}

type SyncStandardMetadataResult {
  createdObjects: [String!]!
  createdFields: [String!]!
  searchableObjects: [String!]!
  createdRoles: [String!]!
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

type FieldWithRelation = FlatFieldMetadata & {
  relation: RelationRef | null;
  morphRelations?: RelationRef[];
};

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
      const morphTargets = field.settings?.morphTargets ?? [];

      // The front reads morphRelations on a morph field the way it reads
      // relation on a plain one, and dereferences the target without a guard.
      if (field.type === 'MORPH_RELATION' && morphTargets.length > 0) {
        const morphRelations = morphTargets
          .map((morphTarget) => {
            const targetObject = objectById.get(morphTarget.objectMetadataId);
            const targetField = targetObject?.fields.find(
              (candidate) => candidate.id === morphTarget.targetFieldMetadataId,
            );

            return targetObject === undefined || targetField === undefined
              ? null
              : {
                  type: (field.settings?.relationType ?? null) as string | null,
                  sourceObjectMetadata: toObjectRef(object),
                  targetObjectMetadata: toObjectRef(targetObject),
                  sourceFieldMetadata: { id: field.id, name: field.name },
                  targetFieldMetadata: {
                    id: targetField.id,
                    name: targetField.name,
                  },
                };
          })
          .filter((entry): entry is RelationRef => entry !== null);

        return morphRelations.length === 0
          ? []
          : [{ ...field, relation: null, morphRelations }];
      }

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
// A role the caller has not read back carries no children; returning them empty
// keeps the mutation's payload valid without a second round trip the front
// throws away anyway.
// Changing who can do what is itself a settings change, so the caller needs the
// settings permission — not merely a session. Without this, any signed-in member
// could grant themselves the admin role. One extra round trip, on mutations that
// happen a handful of times in a workspace's life.
const requireSettingsAccess = async (
  context: MetadataContext,
): Promise<string> => {
  const membership = context.sessionContext?.membership ?? null;

  if (membership === null) {
    throw new Error('UNAUTHENTICATED');
  }

  const permissions = await loadWorkspacePermissions({
    client: context.client,
    workspaceId: membership.workspace.id,
    userWorkspaceId: membership.userWorkspaceId,
    objectMetadataIds: [],
  });

  if (!permissions.canUpdateAllSettings) {
    throw new Error('Not allowed to change settings with your role');
  }

  return membership.workspace.id;
};

const EMPTY_ROLE_CHILDREN = {
  workspaceMembers: [],
  agents: [],
  apiKeys: [],
  permissionFlags: [],
  objectPermissions: [],
  fieldPermissions: [],
  rowLevelPermissionPredicates: [],
  rowLevelPermissionPredicateGroups: [],
};

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

// The front falls back to the number icon when a field has none, which is why
// every column read "123". Names come from twenty-ui's icon set.
const ICON_BY_FIELD_TYPE: Record<string, string> = {
  UUID: 'IconKey',
  TEXT: 'IconAbc',
  NUMBER: 'Icon123',
  NUMERIC: 'Icon123',
  BOOLEAN: 'IconCheckbox',
  DATE_TIME: 'IconCalendarTime',
  DATE: 'IconCalendarEvent',
  CURRENCY: 'IconCurrencyDollar',
  EMAILS: 'IconMail',
  PHONES: 'IconPhone',
  LINKS: 'IconLink',
  ADDRESS: 'IconMap',
  FULL_NAME: 'IconUser',
  ACTOR: 'IconUserCircle',
  RAW_JSON: 'IconCode',
  RICH_TEXT: 'IconFileText',
  FILES: 'IconFiles',
  SELECT: 'IconTag',
  MULTI_SELECT: 'IconTags',
  RATING: 'IconStar',
  ARRAY: 'IconList',
  POSITION: 'IconHierarchy2',
  TS_VECTOR: 'IconSearch',
  RELATION: 'IconRelationOneToMany',
  MORPH_RELATION: 'IconRelationOneToMany',
};

// The GraphQL enum name and the folder on disk differ: twenty-shared maps
// CorePicture to "core-picture", and the front builds URLs from the folder.
const FILE_FOLDER_PATHS: Record<string, string> = {
  CorePicture: 'core-picture',
  AgentChat: 'agent-chat',
  BuiltLogicFunction: 'built-logic-function',
  BuiltFrontComponent: 'built-front-component',
  PublicAsset: 'public-asset',
  Source: 'source',
  FilesField: 'files-field',
  Dependencies: 'dependencies',
  Workflow: 'workflow',
  EmailAttachment: 'email-attachment',
  EmailImage: 'email-image',
  AppTarball: 'app-tarball',
  GeneratedSdkClient: 'generated-sdk-client',
  Dpa: 'dpa',
};

// Namespaces keep the three ids derived from one object distinct.
// Each of these widgets renders one relation of the record, so an object only
// gets the widget when it actually carries that relation — a Notes tab on an
// object with no noteTargets would render an error, not an empty list.
const RELATION_WIDGETS: {
  type: string;
  configurationType: string;
  relationFieldName: string;
  namespace: string;
}[] = [
  {
    type: 'NOTES',
    configurationType: 'NOTES',
    relationFieldName: 'noteTargets',
    namespace: '00000000-0000-4000-8000-000000009n0e',
  },
  {
    type: 'TASKS',
    configurationType: 'TASKS',
    relationFieldName: 'taskTargets',
    namespace: '00000000-0000-4000-8000-000000009ta5',
  },
  {
    type: 'FILES',
    configurationType: 'FILES',
    relationFieldName: 'attachments',
    namespace: '00000000-0000-4000-8000-0000000091e5',
  },
  {
    type: 'TIMELINE',
    configurationType: 'TIMELINE',
    relationFieldName: 'timelineActivities',
    namespace: '00000000-0000-4000-8000-000000009717',
  },
];

const buildRelationWidgets = ({
  object,
  tabId,
}: {
  object: FlatObjectMetadata;
  tabId: string;
}) =>
  RELATION_WIDGETS.filter((widget) =>
    object.fields.some(
      (field) => field.name === widget.relationFieldName && field.isActive,
    ),
  ).map((widget, index) => {
    const widgetId = deriveStableId(object.id, widget.namespace);

    return {
      id: widgetId,
      applicationId: null,
      universalIdentifier: widgetId,
      isSystemSideEffect: false,
      title: widget.type,
      type: widget.type,
      objectMetadataId: object.id,
      createdAt: null,
      updatedAt: null,
      isActive: true,
      deletedAt: null,
      conditionalDisplay: null,
      conditionalAvailabilityExpression: null,
      gridPosition: { column: 0, columnSpan: 12, row: index + 1, rowSpan: 1 },
      position: {
        __type: 'PageLayoutWidgetVerticalListPosition',
        layoutMode: 'VERTICAL_LIST',
        index: index + 1,
        heightBehavior: 'FIT_CONTENT',
      },
      configuration: {
        __type: `${widget.configurationType.charAt(0)}${widget.configurationType.slice(1).toLowerCase()}Configuration`,
        configurationType: widget.configurationType,
      },
      pageLayoutTabId: tabId,
    };
  });

// The four actions we actually write, kept in step with TIMELINE_TYPE_BY_ACTION
// in src/services/timeline.ts. Listing an action we never emit would put a
// filter entry in the timeline dropdown that can only ever match nothing.
const TIMELINE_ACTIVITY_TYPES = [
  {
    action: 'created',
    label: 'Criado',
    icon: 'IconPlus',
    id: '00000000-0000-4000-8000-0000000000c1',
  },
  {
    action: 'updated',
    label: 'Atualizado',
    icon: 'IconPencil',
    id: '00000000-0000-4000-8000-0000000000c2',
  },
  {
    action: 'deleted',
    label: 'Excluído',
    icon: 'IconTrash',
    id: '00000000-0000-4000-8000-0000000000c3',
  },
  {
    action: 'restored',
    label: 'Restaurado',
    icon: 'IconRestore',
    id: '00000000-0000-4000-8000-0000000000c4',
  },
] as const;

const RECORD_PAGE_NAMESPACE = '00000000-0000-4000-8000-00000000900d';
const RECORD_TAB_NAMESPACE = '00000000-0000-4000-8000-0000000090ab';
const FIELDS_WIDGET_NAMESPACE = '00000000-0000-4000-8000-0000000090fe';

type CreateViewArgs = ViewSettingsInput & {
  id?: string | null;
  objectMetadataId: string;
};

type CreateViewSortArgs = {
  id?: string | null;
  viewId: string;
  fieldMetadataId: string;
  direction?: string | null;
  subFieldName?: string | null;
};

type CreateViewGroupArgs = {
  id?: string | null;
  viewId: string;
  fieldValue: string;
  isVisible?: boolean | null;
  position?: number | null;
};

type CreateViewFilterGroupArgs = {
  id?: string | null;
  viewId: string;
  parentViewFilterGroupId?: string | null;
  logicalOperator?: string | null;
  positionInViewFilterGroup?: number | null;
};

const toViewDto = (view: ViewRow, children: ViewChildren) => ({
  ...view,
  viewFields: children.fieldsByViewId.get(view.id) ?? [],
  viewFieldGroups: (children.fieldGroupsByViewId.get(view.id) ?? []).map(
    (group) => ({
      ...group,
      viewFields: (children.fieldsByViewId.get(view.id) ?? []).filter(
        (field) => field.viewFieldGroupId === group.id,
      ),
    }),
  ),
  viewFilters: children.filtersByViewId.get(view.id) ?? [],
  viewFilterGroups: children.filterGroupsByViewId.get(view.id) ?? [],
  viewSorts: children.sortsByViewId.get(view.id) ?? [],
  viewGroups: children.groupsByViewId.get(view.id) ?? [],
  createdByUserWorkspaceId: null,
  isActive: true,
});

const toWorkspaceMemberDto = (member: WorkspaceMemberRow) => ({
  id: member.id,
  name: { firstName: member.nameFirstName, lastName: member.nameLastName },
  colorScheme: member.colorScheme ?? 'System',
  uiScale: 'Normal',
  openRecordIn: 'RECORD_PAGE',
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

  // Synthesised values carry their own type tag: without __resolveType a union
  // field throws at execution, which would take the whole page layout with it.
  PageLayoutWidgetPosition: {
    __resolveType: (value: { __type?: string }) => value.__type ?? null,
  },
  PageLayoutWidgetConfiguration: {
    __resolveType: (value: { __type?: string }) => value.__type ?? null,
  },
  CommandMenuItemPayload: {
    __resolveType: (value: { __type?: string }) => value.__type ?? null,
  },

  Query: {
    currentUser: async (_parent: unknown, _args: unknown, context: MetadataContext) => {
      if (context.sessionContext === null) {
        return null;
      }

      const { user, membership } = context.sessionContext;

      // The front hides an object whose permission entry is missing, so every
      // object needs one — including the ones the role cannot read, which it
      // needs in order to know to hide them.
      const workspacePermissions =
        membership === null
          ? null
          : await loadWorkspacePermissions({
              client: context.client,
              workspaceId: membership.workspace.id,
              userWorkspaceId: membership.userWorkspaceId,
              objectMetadataIds: (
                await loadWorkspaceMetadata({
                  client: context.client,
                  workspaceId: membership.workspace.id,
                  metadataVersion: membership.workspace.metadataVersion,
                })
              ).objects.map((object) => object.id),
            });

      const objectsPermissions =
        workspacePermissions === null
          ? []
          : [...workspacePermissions.byObjectMetadataId.entries()].map(
              ([objectMetadataId, permission]) => ({
                objectMetadataId,
                canReadObjectRecords: permission.canReadObjectRecords,
                canUpdateObjectRecords: permission.canUpdateObjectRecords,
                canSoftDeleteObjectRecords: permission.canSoftDeleteObjectRecords,
                canDestroyObjectRecords: permission.canDestroyObjectRecords,
                // The front runs Object.entries on restrictedFields without a
                // guard, so null here crashes the app after a successful login.
                restrictedFields: permission.restrictedFields,
                rowLevelPermissionPredicates: [],
                rowLevelPermissionPredicateGroups: [],
              }),
            );

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
                permissionFlags: workspacePermissions?.permissionFlags ?? [],
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

      const [views, children] = await Promise.all([
        findViews({
          client: context.client,
          workspaceId: membership.workspace.id,
          viewTypes: args.viewTypes ?? null,
        }),
        loadViewChildren({
          client: context.client,
          workspaceId: membership.workspace.id,
        }),
      ]);

      return views.map((view) => toViewDto(view, children));
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

      const rows = await findViews({
        client: context.client,
        workspaceId: membership.workspace.id,
        viewTypes: ['TABLE'],
      });

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

    // A record page renders nothing without a layout — no layout, no tabs, no
    // widgets, and the page sits on its skeleton forever. One layout per object,
    // derived from the metadata, with a fields widget: the widget falls back to
    // the object's own fields when its view id is null, which is exactly the
    // default Twenty ships.
    getPageLayouts: async (
      _parent: unknown,
      args: { pageLayoutType?: string },
      context: MetadataContext,
    ) => {
      const membership = context.sessionContext?.membership ?? null;

      if (membership === null || args.pageLayoutType !== 'RECORD_PAGE') {
        return [];
      }

      const metadata = await loadWorkspaceMetadata({
        client: context.client,
        workspaceId: membership.workspace.id,
        metadataVersion: membership.workspace.metadataVersion,
      });

      return metadata.objects
        .filter((object) => object.isActive && !object.isSystem)
        .map((object) => {
          const pageLayoutId = deriveStableId(object.id, RECORD_PAGE_NAMESPACE);
          const tabId = deriveStableId(object.id, RECORD_TAB_NAMESPACE);
          const widgetId = deriveStableId(object.id, FIELDS_WIDGET_NAMESPACE);

          return {
            id: pageLayoutId,
            applicationId: null,
            name: object.labelSingular,
            objectMetadataId: object.id,
            type: 'RECORD_PAGE',
            universalIdentifier: pageLayoutId,
            isSystemSideEffect: false,
            isFirstTabPinned: false,
            defaultTabToFocusOnMobileAndSidePanelId: tabId,
            createdAt: null,
            updatedAt: null,
            tabs: [
              {
                id: tabId,
                applicationId: null,
                universalIdentifier: tabId,
                isSystemSideEffect: false,
                title: object.labelSingular,
                icon: object.icon,
                position: 0,
                layoutMode: 'VERTICAL_LIST',
                pageLayoutId,
                isActive: true,
                createdAt: null,
                updatedAt: null,
                widgets: [
                  {
                    id: widgetId,
                    applicationId: null,
                    universalIdentifier: widgetId,
                    isSystemSideEffect: false,
                    title: object.labelSingular,
                    type: 'FIELDS',
                    objectMetadataId: object.id,
                    createdAt: null,
                    updatedAt: null,
                    isActive: true,
                    deletedAt: null,
                    conditionalDisplay: null,
                    conditionalAvailabilityExpression: null,
                    gridPosition: {
                      column: 0,
                      columnSpan: 12,
                      row: 0,
                      rowSpan: 1,
                    },
                    position: {
                      __type: 'PageLayoutWidgetVerticalListPosition',
                      layoutMode: 'VERTICAL_LIST',
                      index: 0,
                      heightBehavior: 'FIT_CONTENT',
                    },
                    configuration: {
                      __type: 'FieldsConfiguration',
                      configurationType: 'FIELDS',
                      viewId: null,
                      newFieldDefaultVisibility: true,
                      shouldAllowUserToSeeHiddenFields: true,
                    },
                    pageLayoutTabId: tabId,
                  },
                  ...buildRelationWidgets({ object, tabId }),
                ],
              },
            ],
          };
        });
    },

    // Collections the front loads at boot but we do not serve yet. They answer
    // empty rather than erroring: an unresolved field would fail the whole
    // document and leave the app on its loading skeleton.
    commandMenuItems: () => [],
    frontComponents: () => [],
    findManyLogicFunctions: () => [],

    // We have no mailbox or calendar sync, so nobody has a connected account and
    // nothing hangs off one. The queries still have to exist: the front asks for
    // them on the settings pages and an unknown field fails the whole document.
    myConnectedAccounts: () => [],
    myMessageChannels: () => [],
    myCalendarChannels: () => [],

    getRoles: async (
      _parent: unknown,
      _args: unknown,
      context: MetadataContext,
    ) => {
      const membership = context.sessionContext?.membership ?? null;

      if (membership === null) {
        return [];
      }

      const workspaceId = membership.workspace.id;

      const [roles, permissionData, members] = await Promise.all([
        findRoles({ client: context.client, workspaceId }),
        loadRolePermissions({ client: context.client, workspaceId }),
        findWorkspaceMembers({ client: context.client, workspaceId }),
      ]);

      // A roleTarget points at a userWorkspace; the front wants the
      // workspaceMember, and the two are linked through the user.
      const { rows: userWorkspaces } = await context.client.query<{
        id: string;
        userId: string;
      }>(
        `SELECT "id","userId" FROM core."userWorkspace" WHERE "workspaceId" = $1`,
        [workspaceId],
      );

      const userIdByUserWorkspaceId = new Map(
        userWorkspaces.map((entry) => [entry.id, entry.userId]),
      );
      const memberByUserId = new Map(
        members
          .filter((member) => member.userId !== null)
          .map((member) => [member.userId as string, member]),
      );

      return roles.map((role) => ({
        ...role,
        workspaceMembers: permissionData.roleTargets
          .filter((target) => target.roleId === role.id)
          .flatMap((target) => {
            const userId =
              target.userWorkspaceId === null
                ? undefined
                : userIdByUserWorkspaceId.get(target.userWorkspaceId);
            const member =
              userId === undefined ? undefined : memberByUserId.get(userId);

            return member === undefined ? [] : [toWorkspaceMemberDto(member)];
          }),
        agents: [],
        apiKeys: [],
        permissionFlags: permissionData.permissionFlags.filter(
          (flag) => flag.roleId === role.id,
        ),
        objectPermissions: permissionData.objectPermissions
          .filter((permission) => permission.roleId === role.id)
          .map((permission) => ({
            ...permission,
            restrictedFields: {},
            rowLevelPermissionPredicates: [],
            rowLevelPermissionPredicateGroups: [],
          })),
        fieldPermissions: permissionData.fieldPermissions.filter(
          (permission) => permission.roleId === role.id,
        ),
        rowLevelPermissionPredicates: [],
        rowLevelPermissionPredicateGroups: [],
      }));
    },

    // The front keys a timeline row to its type by universalIdentifier, then
    // takes the label and the icon from here — and builds the timeline's filter
    // dropdown from this same set, so only actions we actually write belong in
    // it. objectUniversalIdentifier stays null on purpose: it marks an event as
    // being about a LINKED record, and these describe the record itself.
    timelineActivityTypes: () =>
      TIMELINE_ACTIVITY_TYPES.map((activityType) => ({
        id: activityType.id,
        applicationId: null,
        universalIdentifier: activityType.id,
        name: activityType.action,
        label: activityType.label,
        icon: activityType.icon,
        emit: { on: activityType.action, objectUniversalIdentifier: null },
        frontComponentUniversalIdentifier: null,
        isActive: true,
      })),

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

      const [viewRows, children] = await Promise.all([
        findViews({ client: context.client, workspaceId: metadata.workspaceId }),
        loadViewChildren({
          client: context.client,
          workspaceId: metadata.workspaceId,
        }),
      ]);

      const views = viewRows.map((view) => toViewDto(view, children));

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
    openRecordIn: () => 'RECORD_PAGE',
    shortcut: () => null,
    isLabelSyncedWithName: () => false,
    applicationId: () => null,
    duplicateCriteria: (object: { duplicateCriteria: string[][] | null }) =>
      object.duplicateCriteria,
    createdAt: () => new Date().toISOString(),
    updatedAt: () => new Date().toISOString(),
  },

  Field: {
    universalIdentifier: (field: { id: string }) => field.id,
    icon: (field: { icon: string | null; type: string }) =>
      field.icon ?? ICON_BY_FIELD_TYPE[field.type] ?? 'IconAbc',
    isCustom: () => false,
    isUIEditable: () => true,
    isSearchable: () => false,
    writability: () => 'FULL_WRITE',
    isLabelSyncedWithName: () => false,
    morphId: () => null,
    applicationId: () => null,
    morphRelations: (field: { morphRelations?: unknown[] }) =>
      field.morphRelations ?? [],
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
      args: { input: CreateViewArgs },
      context: MetadataContext,
    ) => {
      const membership = requireMembership(context);
      const metadata = await loadMetadataForSession(context);

      const view = await insertView({
        client: context.client,
        workspaceId: membership.workspace.id,
        input: args.input,
      });

      // A view with no fields renders a table with no columns, so the columns
      // are seeded from the object the same way Twenty does at creation.
      const object = metadata.objects.find(
        (entry) => entry.id === view.objectMetadataId,
      );

      if (object !== undefined) {
        await seedViewFields({
          client: context.client,
          workspaceId: membership.workspace.id,
          viewId: view.id,
          fields: orderedVisibleFields(object),
          visibleCount: VISIBLE_VIEW_FIELD_COUNT,
        });
      }

      const children = await loadViewChildren({
        client: context.client,
        workspaceId: membership.workspace.id,
      });

      return toViewDto(view, children);
    },

    updateView: async (
      _parent: unknown,
      args: { id: string; input: ViewSettingsInput },
      context: MetadataContext,
    ) => {
      const membership = requireMembership(context);

      const view = await updateViewSettings({
        client: context.client,
        workspaceId: membership.workspace.id,
        id: args.id,
        input: args.input,
      });

      const children = await loadViewChildren({
        client: context.client,
        workspaceId: membership.workspace.id,
      });

      return toViewDto(view, children);
    },

    deleteView: async (
      _parent: unknown,
      args: { id: string },
      context: MetadataContext,
    ) => {
      const membership = requireMembership(context);

      const view = await softDeleteView({
        client: context.client,
        workspaceId: membership.workspace.id,
        id: args.id,
      });

      const children = await loadViewChildren({
        client: context.client,
        workspaceId: membership.workspace.id,
      });

      return toViewDto(view, children);
    },

    destroyView: (
      _parent: unknown,
      args: { id: string },
      context: MetadataContext,
    ) =>
      destroyView({
        client: context.client,
        workspaceId: requireMembership(context).workspace.id,
        id: args.id,
      }),

    createManyViewFields: (
      _parent: unknown,
      args: { inputs: CreateViewFieldArgs[] },
      context: MetadataContext,
    ) =>
      createViewFields({
        client: context.client,
        workspaceId: requireMembership(context).workspace.id,
        inputs: args.inputs,
      }),

    updateViewField: (
      _parent: unknown,
      args: { input: { id: string; update: Record<string, never> } },
      context: MetadataContext,
    ) =>
      updateViewField({
        client: context.client,
        workspaceId: requireMembership(context).workspace.id,
        id: args.input.id,
        update: args.input.update,
      }),

    deleteViewField: (
      _parent: unknown,
      args: { input: { id: string } },
      context: MetadataContext,
    ) =>
      softDeleteViewChild<ViewFieldRow>({
        client: context.client,
        workspaceId: requireMembership(context).workspace.id,
        table: 'viewField',
        id: args.input.id,
      }),

    destroyViewField: (
      _parent: unknown,
      args: { input: { id: string } },
      context: MetadataContext,
    ) =>
      destroyViewChild<ViewFieldRow>({
        client: context.client,
        workspaceId: requireMembership(context).workspace.id,
        table: 'viewField',
        id: args.input.id,
      }),

    createViewFilter: (
      _parent: unknown,
      args: { input: CreateViewFilterArgs },
      context: MetadataContext,
    ) =>
      createViewFilter({
        client: context.client,
        workspaceId: requireMembership(context).workspace.id,
        input: args.input,
      }),

    updateViewFilter: (
      _parent: unknown,
      args: { input: { id: string; update: Record<string, never> } },
      context: MetadataContext,
    ) =>
      updateViewFilter({
        client: context.client,
        workspaceId: requireMembership(context).workspace.id,
        id: args.input.id,
        update: args.input.update,
      }),

    deleteViewFilter: (
      _parent: unknown,
      args: { input: { id: string } },
      context: MetadataContext,
    ) =>
      softDeleteViewChild<ViewFilterRow>({
        client: context.client,
        workspaceId: requireMembership(context).workspace.id,
        table: 'viewFilter',
        id: args.input.id,
      }),

    destroyViewFilter: (
      _parent: unknown,
      args: { input: { id: string } },
      context: MetadataContext,
    ) =>
      destroyViewChild<ViewFilterRow>({
        client: context.client,
        workspaceId: requireMembership(context).workspace.id,
        table: 'viewFilter',
        id: args.input.id,
      }),

    createViewSort: (
      _parent: unknown,
      args: { input: CreateViewSortArgs },
      context: MetadataContext,
    ) =>
      createViewSort({
        client: context.client,
        workspaceId: requireMembership(context).workspace.id,
        input: args.input,
      }),

    updateViewSort: (
      _parent: unknown,
      args: { input: { id: string; update: Record<string, never> } },
      context: MetadataContext,
    ) =>
      updateViewSort({
        client: context.client,
        workspaceId: requireMembership(context).workspace.id,
        id: args.input.id,
        update: args.input.update,
      }),

    deleteViewSort: async (
      _parent: unknown,
      args: { input: { id: string } },
      context: MetadataContext,
    ) => {
      await softDeleteViewChild({
        client: context.client,
        workspaceId: requireMembership(context).workspace.id,
        table: 'viewSort',
        id: args.input.id,
      });

      return true;
    },

    destroyViewSort: async (
      _parent: unknown,
      args: { input: { id: string } },
      context: MetadataContext,
    ) => {
      await destroyViewChild({
        client: context.client,
        workspaceId: requireMembership(context).workspace.id,
        table: 'viewSort',
        id: args.input.id,
      });

      return true;
    },

    createManyViewGroups: (
      _parent: unknown,
      args: { inputs: CreateViewGroupArgs[] },
      context: MetadataContext,
    ) =>
      createViewGroups({
        client: context.client,
        workspaceId: requireMembership(context).workspace.id,
        inputs: args.inputs,
      }),

    updateManyViewGroups: (
      _parent: unknown,
      args: { inputs: { id: string; update: Record<string, never> }[] },
      context: MetadataContext,
    ) =>
      updateViewGroups({
        client: context.client,
        workspaceId: requireMembership(context).workspace.id,
        inputs: args.inputs,
      }),

    createViewFilterGroup: (
      _parent: unknown,
      args: { input: CreateViewFilterGroupArgs },
      context: MetadataContext,
    ) =>
      createViewFilterGroup({
        client: context.client,
        workspaceId: requireMembership(context).workspace.id,
        input: args.input,
      }),

    updateViewFilterGroup: (
      _parent: unknown,
      args: { input: { id: string } & Record<string, never> },
      context: MetadataContext,
    ) =>
      updateViewFilterGroup({
        client: context.client,
        workspaceId: requireMembership(context).workspace.id,
        input: args.input,
      }),

    destroyViewFilterGroup: async (
      _parent: unknown,
      args: { id: string },
      context: MetadataContext,
    ) => {
      await destroyViewChild({
        client: context.client,
        workspaceId: requireMembership(context).workspace.id,
        table: 'viewFilterGroup',
        id: args.id,
      });

      return true;
    },

    // The browser PUTs straight to the URL this hands back, then calls
    // completeFileUpload. Twenty presigns an S3 URL when storage is configured
    // for it and otherwise points at its own endpoint; we do the latter, so the
    // URL carries a short-lived token instead of a cookie.
    createFileUpload: async (
      _parent: unknown,
      args: {
        filename: string;
        size: number;
        fileFolder: string;
        fieldMetadataId?: string | null;
      },
      context: MetadataContext,
    ) => {
      const membership = requireMembership(context);
      const user = requireAuthenticatedUser(context);
      const folder = FILE_FOLDER_PATHS[args.fileFolder];

      if (folder === undefined) {
        throw new Error(`UNKNOWN_FILE_FOLDER: ${args.fileFolder}`);
      }

      const file = await insertFile({
        client: context.client,
        workspaceId: membership.workspace.id,
        name: args.filename,
        folder,
        size: args.size,
        type: null,
        fieldMetadataId: args.fieldMetadataId ?? null,
        createdByUserId: user.id,
      });

      const { token, expiresAt } = await issueUploadToken({
        appSecret: context.appSecret,
        workspaceId: membership.workspace.id,
        fileId: file.id,
      });

      return {
        fileId: file.id,
        uploadUrl: `${context.serverUrl}/files/${folder}/${file.id}?token=${token}`,
        contentType: 'application/octet-stream',
        expiresAt: expiresAt.toISOString(),
      };
    },

    completeFileUpload: async (
      _parent: unknown,
      args: { fileId: string },
      context: MetadataContext,
    ) => {
      const membership = requireMembership(context);

      const file = await markFileUploaded({
        client: context.client,
        workspaceId: membership.workspace.id,
        fileId: args.fileId,
        size: null,
      });

      if (file === null) {
        throw new Error('FILE_NOT_FOUND');
      }

      const path = `${file.folder}/${file.id}`;

      return {
        id: file.id,
        path,
        size: Number(file.size),
        createdAt: file.createdAt,
        url: `${context.serverUrl}/files/${path}`,
      };
    },

    // Brings a workspace created before a standard object or field existed up
    // to the current seed. Idempotent: the ids are derived, so a second run
    // finds nothing missing.
    createOneRole: async (
      _parent: unknown,
      args: { createRoleInput: Parameters<typeof createRole>[0]['input'] },
      context: MetadataContext,
    ) => ({
      ...(await createRole({
        client: context.client,
        workspaceId: await requireSettingsAccess(context),
        input: args.createRoleInput,
      })),
      ...EMPTY_ROLE_CHILDREN,
    }),

    updateOneRole: async (
      _parent: unknown,
      args: {
        updateRoleInput: {
          id: string;
          update: Parameters<typeof updateRole>[0]['input'];
        };
      },
      context: MetadataContext,
    ) => ({
      ...(await updateRole({
        client: context.client,
        workspaceId: await requireSettingsAccess(context),
        roleId: args.updateRoleInput.id,
        input: args.updateRoleInput.update,
      })),
      ...EMPTY_ROLE_CHILDREN,
    }),

    deleteOneRole: async (
      _parent: unknown,
      args: { roleId: string },
      context: MetadataContext,
    ) =>
      deleteRole({
        client: context.client,
        workspaceId: await requireSettingsAccess(context),
        roleId: args.roleId,
      }),

    updateWorkspaceMemberRole: async (
      _parent: unknown,
      args: { workspaceMemberId: string; roleId: string },
      context: MetadataContext,
    ) => {
      const workspaceId = await requireSettingsAccess(context);

      const members = await findWorkspaceMembers({
        client: context.client,
        workspaceId,
      });

      const member = members.find((entry) => entry.id === args.workspaceMemberId);

      if (member === undefined || member.userId === null) {
        throw new Error('Workspace member not found');
      }

      const { rows } = await context.client.query<{ id: string }>(
        `SELECT "id" FROM core."userWorkspace"
         WHERE "workspaceId" = $1 AND "userId" = $2 LIMIT 1`,
        [workspaceId, member.userId],
      );

      if (rows[0] === undefined) {
        throw new Error('Workspace member has no membership row');
      }

      await assignRoleToWorkspaceMember({
        client: context.client,
        workspaceId,
        userWorkspaceId: rows[0].id,
        roleId: args.roleId,
      });

      const roles = await findRoles({ client: context.client, workspaceId });

      return {
        ...toWorkspaceMemberDto(member),
        roles: roles
          .filter((role) => role.id === args.roleId)
          .map((role) => ({ ...role, ...EMPTY_ROLE_CHILDREN })),
      };
    },

    upsertObjectPermissions: async (
      _parent: unknown,
      args: {
        upsertObjectPermissionsInput: {
          roleId: string;
          objectPermissions: Parameters<
            typeof upsertObjectPermissions
          >[0]['objectPermissions'];
        };
      },
      context: MetadataContext,
    ) =>
      (
        await upsertObjectPermissions({
          client: context.client,
          workspaceId: await requireSettingsAccess(context),
          roleId: args.upsertObjectPermissionsInput.roleId,
          objectPermissions:
            args.upsertObjectPermissionsInput.objectPermissions,
        })
      ).map((permission) => ({
        ...permission,
        restrictedFields: {},
        rowLevelPermissionPredicates: [],
        rowLevelPermissionPredicateGroups: [],
      })),

    upsertFieldPermissions: async (
      _parent: unknown,
      args: {
        upsertFieldPermissionsInput: {
          roleId: string;
          fieldPermissions: Parameters<
            typeof upsertFieldPermissions
          >[0]['fieldPermissions'];
        };
      },
      context: MetadataContext,
    ) =>
      upsertFieldPermissions({
        client: context.client,
        workspaceId: await requireSettingsAccess(context),
        roleId: args.upsertFieldPermissionsInput.roleId,
        fieldPermissions: args.upsertFieldPermissionsInput.fieldPermissions,
      }),

    upsertPermissionFlags: async (
      _parent: unknown,
      args: {
        upsertPermissionFlagsInput: {
          roleId: string;
          permissionFlagKeys: string[];
        };
      },
      context: MetadataContext,
    ) =>
      upsertPermissionFlags({
        client: context.client,
        workspaceId: await requireSettingsAccess(context),
        roleId: args.upsertPermissionFlagsInput.roleId,
        flags: args.upsertPermissionFlagsInput.permissionFlagKeys,
      }),

    syncStandardMetadata: async (
      _parent: unknown,
      _args: unknown,
      context: MetadataContext,
    ) => {
      const membership = requireMembership(context);

      return syncStandardMetadata({
        client: context.client,
        workspaceId: membership.workspace.id,
      });
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
