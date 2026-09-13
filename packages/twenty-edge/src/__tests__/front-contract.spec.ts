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

  // GetCurrentUser + UserQueryFragment and every fragment it spreads, copied
  // verbatim from packages/twenty-front/src/modules/users/graphql/**,
  // workspace-member/graphql/**, settings/roles/graphql/** and
  // settings/billing/graphql/**. This is the document that decides whether the
  // app boots: one unknown field on it and the user never gets past login.
  it('validates the current user query the front actually sends', () => {
    expectValid(`
      query GetCurrentUser {
        currentUser {
          ...UserQueryFragment
        }
      }

      fragment UserQueryFragment on User {
        id
        firstName
        lastName
        email
        hasPassword
        canAccessFullAdminPanel
        canImpersonate
        supportUserHash
        onboardingStatus
        previousOnboardingStatus
        isWorkspaceCreator
        workspaceMember { ...WorkspaceMemberQueryFragment }
        workspaceMembers { ...PartialWorkspaceMemberQueryFragment }
        deletedWorkspaceMembers { ...DeletedWorkspaceMemberQueryFragment }
        currentUserWorkspace {
          id
          permissionFlags
          isImpersonating
          objectsPermissions { ...ObjectPermissionFragment }
          twoFactorAuthenticationMethodSummary {
            twoFactorAuthenticationMethodId
            status
            strategy
          }
        }
        currentWorkspace {
          id
          displayName
          logo
          inviteHash
          allowImpersonation
          activationStatus
          isPublicInviteLinkEnabled
          workspaceDiscoverability
          isGoogleAuthEnabled
          isMicrosoftAuthEnabled
          isPasswordAuthEnabled
          isGoogleAuthBypassEnabled
          isMicrosoftAuthBypassEnabled
          isPasswordAuthBypassEnabled
          subdomain
          customDomain
          hasValidSignedEnterpriseKey
          hasValidEnterpriseValidityToken
          workspaceCustomApplication { id }
          installedApplications { id name universalIdentifier logoUrl }
          isCustomDomainEnabled
          workspaceUrls { ...WorkspaceUrlsFragment }
          featureFlags { key value }
          currentBillingSubscription { ...CurrentBillingSubscriptionFragment }
          billingCustomer { id hasPaymentMethod }
          billingSubscriptions { ...BillingSubscriptionFragment }
          billingEntitlements { key value }
          workspaceMembersCount
          defaultRole { ...RoleFragment }
          aiChatModelTier
          aiAgentModelTier
          isAutoModelSelectionEnabled
          aiModelIdByTier
          aiAdditionalInstructions
          isTwoFactorAuthenticationEnforced
          trashRetentionDays
          eventLogRetentionDays
          editableProfileFields
          isInternalMessagesImportEnabled
        }
        availableWorkspaces { ...AvailableWorkspacesFragment }
        userVars
      }

      fragment WorkspaceMemberQueryFragment on WorkspaceMember {
        id
        name { firstName lastName }
        colorScheme
        uiScale
        openRecordIn
        avatarUrl
        locale
        userEmail
        userWorkspaceId
        timeZone
        dateFormat
        timeFormat
        calendarStartDay
        numberFormat
      }

      fragment PartialWorkspaceMemberQueryFragment on WorkspaceMember {
        id
        name { firstName lastName }
        avatarUrl
        userEmail
        userWorkspaceId
      }

      fragment DeletedWorkspaceMemberQueryFragment on DeletedWorkspaceMember {
        id
        name { firstName lastName }
        avatarUrl
        userEmail
      }

      fragment ObjectPermissionFragment on ObjectPermission {
        objectMetadataId
        canReadObjectRecords
        canUpdateObjectRecords
        canSoftDeleteObjectRecords
        canDestroyObjectRecords
        restrictedFields
        rowLevelPermissionPredicates { ...RowLevelPermissionPredicateFragment }
        rowLevelPermissionPredicateGroups {
          ...RowLevelPermissionPredicateGroupFragment
        }
      }

      fragment RowLevelPermissionPredicateFragment on RowLevelPermissionPredicate {
        id
        fieldMetadataId
        objectMetadataId
        operand
        subFieldName
        workspaceMemberFieldMetadataId
        workspaceMemberSubFieldName
        rowLevelPermissionPredicateGroupId
        positionInRowLevelPermissionPredicateGroup
        roleId
        value
      }

      fragment RowLevelPermissionPredicateGroupFragment on RowLevelPermissionPredicateGroup {
        id
        parentRowLevelPermissionPredicateGroupId
        logicalOperator
        positionInRowLevelPermissionPredicateGroup
        roleId
        objectMetadataId
      }

      fragment WorkspaceUrlsFragment on WorkspaceUrls {
        subdomainUrl
        customUrl
      }

      fragment RoleFragment on Role {
        id
        label
        description
        icon
        canUpdateAllSettings
        canAccessAllTools
        isEditable
        canReadAllObjectRecords
        canUpdateAllObjectRecords
        canSoftDeleteAllObjectRecords
        canDestroyAllObjectRecords
        canBeAssignedToUsers
        canBeAssignedToAgents
        canBeAssignedToApiKeys
      }

      fragment CurrentBillingSubscriptionFragment on BillingSubscription {
        id
        status
        interval
        metadata
        currentPeriodEnd
        cancelAt
        phases { ...BillingSubscriptionSchedulePhaseFragment }
        billingSubscriptionItems {
          id
          hasReachedCurrentPeriodCap
          quantity
          stripePriceId
          unitAmount
          creditAmount
          billingProduct {
            name
            description
            images
            metadata { productKey planKey priceUsageBased isLegacy }
          }
        }
      }

      fragment BillingSubscriptionFragment on BillingSubscription {
        id
        status
        metadata
        cancelAt
        phases { ...BillingSubscriptionSchedulePhaseFragment }
      }

      fragment BillingSubscriptionSchedulePhaseFragment on BillingSubscriptionSchedulePhase {
        start_date
        end_date
        items { ...BillingSubscriptionSchedulePhaseItemFragment }
      }

      fragment BillingSubscriptionSchedulePhaseItemFragment on BillingSubscriptionSchedulePhaseItem {
        price
        quantity
      }

      fragment AvailableWorkspacesFragment on AvailableWorkspaces {
        availableWorkspacesForSignIn { ...AvailableWorkspaceFragment }
        availableWorkspacesForSignUp { ...AvailableWorkspaceFragment }
      }

      fragment AvailableWorkspaceFragment on AvailableWorkspace {
        id
        displayName
        loginToken
        inviteHash
        personalInviteToken
        workspaceUrls { subdomainUrl customUrl }
        logo
        sso { type id issuer name status }
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

  // The nine collections MinimalMetadataLoadEffect pulls when the store is cold.
  // Copied verbatim from packages/twenty-front/src/modules/**/graphql/queries/**.
  it('validates the view documents, including the ViewType enum variable', () => {
    expectValid(`
      query FindAllViews($viewTypes: [ViewType!]) {
        getViews(viewTypes: $viewTypes) { ...ViewFragment }
      }

      fragment ViewFragment on View {
        id
        name
        objectMetadataId
        type
        key
        icon
        position
        isCompact
        kanbanAggregateOperation
        kanbanAggregateOperationFieldMetadataId
        mainGroupByFieldMetadataId
        shouldHideEmptyGroups
        kanbanColumnWidth
        anyFieldFilterValue
        calendarFieldMetadataId
        calendarEndFieldMetadataId
        calendarLayout
        visibility
        createdByUserWorkspaceId
        isActive
        viewFields { ...ViewFieldFragment }
        viewFieldGroups { ...ViewFieldGroupFragment }
        viewFilters { ...ViewFilterFragment }
        viewFilterGroups { ...ViewFilterGroupFragment }
        viewSorts { ...ViewSortFragment }
        viewGroups { ...ViewGroupFragment }
      }

      fragment ViewFieldFragment on ViewField {
        id fieldMetadataId viewId isVisible position size aggregateOperation
        viewFieldGroupId isActive createdAt updatedAt deletedAt
      }

      fragment ViewFieldGroupFragment on ViewFieldGroup {
        id name position isVisible viewId isActive createdAt updatedAt deletedAt
        viewFields { ...ViewFieldFragment }
      }

      fragment ViewFilterFragment on ViewFilter {
        id fieldMetadataId operand value viewFilterGroupId positionInViewFilterGroup
        subFieldName relationTargetFieldMetadataId viewId createdAt updatedAt deletedAt
      }

      fragment ViewFilterGroupFragment on ViewFilterGroup {
        id parentViewFilterGroupId logicalOperator positionInViewFilterGroup viewId
      }

      fragment ViewSortFragment on ViewSort {
        id fieldMetadataId direction subFieldName viewId createdAt deletedAt updatedAt
      }

      fragment ViewGroupFragment on ViewGroup {
        id isVisible fieldValue position viewId createdAt updatedAt deletedAt
      }
    `);
  });

  it('validates the page layout documents', () => {
    expectValid(`
      query FindAllRecordPageLayouts {
        getPageLayouts(pageLayoutType: RECORD_PAGE) { ...PageLayoutFragment }
      }

      fragment PageLayoutFragment on PageLayout {
        id applicationId name objectMetadataId type universalIdentifier
        isSystemSideEffect isFirstTabPinned defaultTabToFocusOnMobileAndSidePanelId
        createdAt updatedAt
        tabs { ...PageLayoutTabFragment }
      }

      fragment PageLayoutTabFragment on PageLayoutTab {
        id applicationId universalIdentifier isSystemSideEffect title icon position
        layoutMode widgets { ...PageLayoutWidgetFragment } pageLayoutId isActive
        createdAt updatedAt
      }

      fragment PageLayoutWidgetFragment on PageLayoutWidget {
        id applicationId universalIdentifier isSystemSideEffect title type
        objectMetadataId createdAt updatedAt isActive deletedAt conditionalDisplay
        conditionalAvailabilityExpression
        gridPosition { column columnSpan row rowSpan }
        position {
          ... on PageLayoutWidgetGridPosition { layoutMode row column rowSpan columnSpan }
          ... on PageLayoutWidgetVerticalListPosition { layoutMode index heightBehavior }
          ... on PageLayoutWidgetCanvasPosition { layoutMode }
        }
        configuration {
          ... on BarChartConfiguration { configurationType aggregateFieldMetadataId aggregateOperation groupMode layout isCumulative }
          ... on LineChartConfiguration { configurationType aggregateFieldMetadataId isStacked }
          ... on PieChartConfiguration { configurationType groupByFieldMetadataId hideEmptyCategory }
          ... on AggregateChartConfiguration { configurationType label prefix suffix ratioAggregateConfig { fieldMetadataId optionValue } }
          ... on IframeConfiguration { configurationType url }
          ... on StandaloneRichTextConfiguration { configurationType body { blocknote markdown } }
          ... on CalendarConfiguration { configurationType }
          ... on EmailsConfiguration { configurationType }
          ... on EmailThreadConfiguration { configurationType }
          ... on CallRecordingSummaryConfiguration { configurationType }
          ... on CallRecordingTranscriptConfiguration { configurationType }
          ... on MessageCampaignBodyConfiguration { configurationType }
          ... on MessageCampaignDetailsConfiguration { configurationType }
          ... on FieldConfiguration { configurationType fieldDisplayMode fieldMetadataId viewId nestedRelationFieldMetadataId isUIEditable }
          ... on FieldRichTextConfiguration { configurationType }
          ... on FieldsConfiguration { configurationType viewId newFieldDefaultVisibility shouldAllowUserToSeeHiddenFields }
          ... on FormFieldConfiguration { configurationType fieldMetadataId }
          ... on FilesConfiguration { configurationType }
          ... on NotesConfiguration { configurationType }
          ... on TasksConfiguration { configurationType }
          ... on TimelineConfiguration { configurationType }
          ... on ViewConfiguration { configurationType }
          ... on RecordTableConfiguration { configurationType viewId recordLimit isUIEditable }
          ... on WorkflowConfiguration { configurationType }
          ... on WorkflowRunConfiguration { configurationType }
          ... on WorkflowVersionConfiguration { configurationType }
          ... on FrontComponentConfiguration { configurationType frontComponentId headerCommandMenuItemUniversalIdentifiers }
        }
        pageLayoutTabId
      }
    `);
  });

  // Posted on every route change. It is fire-and-forget for the app, so a
  // rejected document shows up only as a console error — and as a 400 on every
  // navigation.
  it('validates the session list the settings screen reads', () => {
    expectValid(`
      query CurrentUserSessions {
        currentUserSessions {
          id
          workspaceId
          authProvider
          isImpersonating
          userAgent
          ipAddress
          createdAt
          lastActiveAt
          expiresAt
          isCurrent
        }
      }
    `);
  });

  // The twenty mutations behind saved views, copied verbatim from
  // packages/twenty-front/src/modules/views/graphql/mutations/**. A view whose
  // filters cannot be written is a filter that dies with the browser tab.
  it('validates the view mutations', () => {
    const VIEW_CHILD_FRAGMENTS = `
      fragment ViewFieldFragment on ViewField {
        id fieldMetadataId viewId isVisible position size aggregateOperation
        viewFieldGroupId isActive createdAt updatedAt deletedAt
      }
      fragment ViewFilterFragment on ViewFilter {
        id fieldMetadataId operand value viewFilterGroupId positionInViewFilterGroup
        subFieldName relationTargetFieldMetadataId viewId createdAt updatedAt deletedAt
      }
      fragment ViewFilterGroupFragment on ViewFilterGroup {
        id parentViewFilterGroupId logicalOperator positionInViewFilterGroup viewId
      }
      fragment ViewSortFragment on ViewSort {
        id fieldMetadataId direction subFieldName viewId createdAt deletedAt updatedAt
      }
      fragment ViewGroupFragment on ViewGroup {
        id isVisible fieldValue position viewId createdAt updatedAt deletedAt
      }
    `;

    for (const document of [
      `mutation CreateManyViewFields($inputs: [CreateViewFieldInput!]!) {
        createManyViewFields(inputs: $inputs) { ...ViewFieldFragment }
      }`,
      `mutation UpdateViewField($input: UpdateViewFieldInput!) {
        updateViewField(input: $input) { ...ViewFieldFragment }
      }`,
      `mutation DeleteViewField($input: DeleteViewFieldInput!) {
        deleteViewField(input: $input) { ...ViewFieldFragment }
      }`,
      `mutation DestroyViewField($input: DestroyViewFieldInput!) {
        destroyViewField(input: $input) { ...ViewFieldFragment }
      }`,
      `mutation CreateViewFilter($input: CreateViewFilterInput!) {
        createViewFilter(input: $input) { ...ViewFilterFragment }
      }`,
      `mutation UpdateViewFilter($input: UpdateViewFilterInput!) {
        updateViewFilter(input: $input) { ...ViewFilterFragment }
      }`,
      `mutation DeleteViewFilter($input: DeleteViewFilterInput!) {
        deleteViewFilter(input: $input) { ...ViewFilterFragment }
      }`,
      `mutation DestroyViewFilter($input: DestroyViewFilterInput!) {
        destroyViewFilter(input: $input) { ...ViewFilterFragment }
      }`,
      `mutation CreateViewFilterGroup($input: CreateViewFilterGroupInput!) {
        createViewFilterGroup(input: $input) { ...ViewFilterGroupFragment }
      }`,
      `mutation UpdateViewFilterGroup($input: UpdateViewFilterGroupInput!) {
        updateViewFilterGroup(input: $input) { ...ViewFilterGroupFragment }
      }`,
      `mutation DestroyViewFilterGroup($id: String!) { destroyViewFilterGroup(id: $id) }`,
      `mutation CreateViewSort($input: CreateViewSortInput!) {
        createViewSort(input: $input) { ...ViewSortFragment }
      }`,
      `mutation UpdateViewSort($input: UpdateViewSortInput!) {
        updateViewSort(input: $input) { ...ViewSortFragment }
      }`,
      `mutation DeleteViewSort($input: DeleteViewSortInput!) { deleteViewSort(input: $input) }`,
      `mutation DestroyViewSort($input: DestroyViewSortInput!) { destroyViewSort(input: $input) }`,
      `mutation CreateManyViewGroups($inputs: [CreateViewGroupInput!]!) {
        createManyViewGroups(inputs: $inputs) { ...ViewGroupFragment }
      }`,
      `mutation UpdateManyViewGroups($inputs: [UpdateViewGroupInput!]!) {
        updateManyViewGroups(inputs: $inputs) { ...ViewGroupFragment }
      }`,
      `mutation DestroyView($id: String!) { destroyView(id: $id) }`,
    ]) {
      expectValid(`${document}\n${VIEW_CHILD_FRAGMENTS}`);
    }
  });

  it('validates createView and updateView', () => {
    expectValid(`
      mutation CreateView($input: CreateViewInput!) {
        createView(input: $input) { id name type key icon position }
      }
    `);

    expectValid(`
      mutation UpdateView($id: String!, $input: UpdateViewInput!) {
        updateView(id: $id, input: $input) { id name type key icon position }
      }
    `);
  });

  it('validates the analytics mutation', () => {
    expectValid(`
      mutation TrackAnalytics(
        $type: AnalyticsType!
        $event: String
        $name: String
        $properties: JSON
      ) {
        trackAnalytics(
          type: $type
          event: $event
          name: $name
          properties: $properties
        ) {
          success
        }
      }
    `);
  });

  it('validates the remaining boot collections', () => {
    expectValid(`
      query FindManyCommandMenuItems {
        commandMenuItems {
          id universalIdentifier applicationId workflowVersionId frontComponentId
          frontComponent { id name isHeadless }
          engineComponentKey label icon shortLabel position isPinned
          payload { ... on PathCommandMenuItemPayload { path } }
          hotKeys conditionalAvailabilityExpression conditionalPinnedExpression
          availabilityType availabilityObjectMetadataId
          navigationTargetObjectMetadataId pageLayoutId isActive
        }
      }
    `);

    expectValid(`
      query FindManyNavigationMenuItems {
        navigationMenuItems {
          id type userWorkspaceId targetRecordId targetObjectMetadataId viewId
          folderId name link icon color pageLayoutId position applicationId
          createdAt updatedAt
          targetRecordIdentifier { id labelIdentifier imageIdentifier }
        }
      }
    `);

    expectValid(`
      query FindManyFrontComponents {
        frontComponents {
          id name applicationId builtComponentChecksum builtComponentPath
          componentName createdAt description isHeadless sourceComponentPath
          universalIdentifier updatedAt usesSdkClient
          frontComponentSharedDependenciesChecksum
        }
      }
    `);

    expectValid(`
      query FindManyLogicFunctions {
        findManyLogicFunctions {
          id name description runtime timeoutSeconds executionMode
          sourceHandlerPath handlerName cronTriggerSettings
          databaseEventTriggerSettings httpRouteTriggerSettings toolTriggerSettings
          workflowActionTriggerSettings applicationId universalIdentifier
          createdAt updatedAt
        }
      }
    `);
  });

  it('validates the minimal metadata query the front boots on', () => {
    expectValid(`
      query FindMinimalMetadata {
        minimalMetadata {
          objectMetadataItems {
            id
            nameSingular
            namePlural
            labelSingular
            labelPlural
            icon
            isActive
            isSystem
            isRemote
          }
          views {
            id
            type
            key
            objectMetadataId
          }
          collectionHashes {
            collectionName
            hash
          }
        }
      }
    `);
  });
});
