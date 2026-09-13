// Every type below exists because a twenty-front boot document names it. The
// front loads nine metadata collections on first render and GraphQL fails a
// whole document on one unknown field, so a type missing here is a boot error,
// not a missing feature. The collections we do not implement yet resolve to
// empty lists — the app then renders without them instead of not rendering.
export const BOOT_SCHEMA_SDL = `
enum ViewType {
  TABLE
  KANBAN
  CALENDAR
  LIST
  FIELDS_WIDGET
  TABLE_WIDGET
  KANBAN_WIDGET
  LIST_WIDGET
  CALENDAR_WIDGET
}

enum PageLayoutType { RECORD_PAGE RECORD_FORM DASHBOARD }

# The front posts a pageview on every route change. It is fire-and-forget for
# the app, but a rejected document still shows up as a console error on every
# navigation, so the mutation exists and answers success.
scalar JSON

enum AnalyticsType { PAGEVIEW TRACK }

type Analytics { success: Boolean! }

type ViewField {
  id: UUID!
  fieldMetadataId: UUID!
  viewId: UUID!
  isVisible: Boolean
  position: Float
  size: Float
  aggregateOperation: String
  viewFieldGroupId: UUID
  isActive: Boolean
  createdAt: DateTime
  updatedAt: DateTime
  deletedAt: DateTime
}

type ViewFieldGroup {
  id: UUID!
  name: String
  position: Float
  isVisible: Boolean
  viewId: UUID!
  isActive: Boolean
  createdAt: DateTime
  updatedAt: DateTime
  deletedAt: DateTime
  viewFields: [ViewField!]!
}

type ViewFilter {
  id: UUID!
  fieldMetadataId: UUID!
  operand: String
  value: RawJSON
  viewFilterGroupId: UUID
  positionInViewFilterGroup: Float
  subFieldName: String
  relationTargetFieldMetadataId: UUID
  viewId: UUID!
  createdAt: DateTime
  updatedAt: DateTime
  deletedAt: DateTime
}

type ViewFilterGroup {
  id: UUID!
  parentViewFilterGroupId: UUID
  logicalOperator: String
  positionInViewFilterGroup: Float
  viewId: UUID!
}

type ViewSort {
  id: UUID!
  fieldMetadataId: UUID!
  direction: String
  subFieldName: String
  viewId: UUID!
  createdAt: DateTime
  updatedAt: DateTime
  deletedAt: DateTime
}

type ViewGroup {
  id: UUID!
  isVisible: Boolean
  fieldValue: String
  position: Float
  viewId: UUID!
  createdAt: DateTime
  updatedAt: DateTime
  deletedAt: DateTime
}

type FrontComponent {
  id: UUID!
  name: String
  applicationId: UUID
  builtComponentChecksum: String
  builtComponentPath: String
  componentName: String
  createdAt: DateTime
  description: String
  isHeadless: Boolean
  sourceComponentPath: String
  universalIdentifier: UUID
  updatedAt: DateTime
  usesSdkClient: Boolean
  frontComponentSharedDependenciesChecksum: String
}

type LogicFunction {
  id: UUID!
  name: String
  description: String
  runtime: String
  timeoutSeconds: Float
  executionMode: String
  sourceHandlerPath: String
  handlerName: String
  cronTriggerSettings: RawJSON
  databaseEventTriggerSettings: RawJSON
  httpRouteTriggerSettings: RawJSON
  toolTriggerSettings: RawJSON
  workflowActionTriggerSettings: RawJSON
  applicationId: UUID
  universalIdentifier: UUID
  createdAt: DateTime
  updatedAt: DateTime
}

type TargetRecordIdentifier {
  id: UUID!
  labelIdentifier: String
  imageIdentifier: String
}

type NavigationMenuItem {
  id: UUID!
  type: String
  userWorkspaceId: UUID
  targetRecordId: UUID
  targetObjectMetadataId: UUID
  viewId: UUID
  folderId: UUID
  name: String
  link: String
  icon: String
  color: String
  pageLayoutId: UUID
  position: Float
  applicationId: UUID
  createdAt: DateTime
  updatedAt: DateTime
  targetRecordIdentifier: TargetRecordIdentifier
}

type PathCommandMenuItemPayload { path: String }

union CommandMenuItemPayload = PathCommandMenuItemPayload

type CommandMenuItem {
  id: UUID!
  universalIdentifier: UUID
  applicationId: UUID
  workflowVersionId: UUID
  frontComponentId: UUID
  frontComponent: FrontComponent
  engineComponentKey: String
  label: String
  icon: String
  shortLabel: String
  position: Float
  isPinned: Boolean
  payload: CommandMenuItemPayload
  hotKeys: RawJSON
  conditionalAvailabilityExpression: RawJSON
  conditionalPinnedExpression: RawJSON
  availabilityType: String
  availabilityObjectMetadataId: UUID
  navigationTargetObjectMetadataId: UUID
  pageLayoutId: UUID
  isActive: Boolean
}

type PageLayoutWidgetGridPosition {
  layoutMode: String
  row: Float
  column: Float
  rowSpan: Float
  columnSpan: Float
}

type PageLayoutWidgetVerticalListPosition {
  layoutMode: String
  index: Float
  heightBehavior: String
}

type PageLayoutWidgetCanvasPosition { layoutMode: String }

union PageLayoutWidgetPosition =
    PageLayoutWidgetGridPosition
  | PageLayoutWidgetVerticalListPosition
  | PageLayoutWidgetCanvasPosition

type RatioAggregateConfig { fieldMetadataId: UUID optionValue: String }

type RichTextBody { blocknote: String markdown: String }

type BarChartConfiguration {
  configurationType: String
  aggregateFieldMetadataId: UUID
  aggregateOperation: String
  primaryAxisGroupByFieldMetadataId: UUID
  primaryAxisGroupBySubFieldName: String
  primaryAxisDateGranularity: String
  primaryAxisOrderBy: String
  primaryAxisManualSortOrder: [String!]
  secondaryAxisGroupByFieldMetadataId: UUID
  secondaryAxisGroupBySubFieldName: String
  secondaryAxisGroupByDateGranularity: String
  secondaryAxisOrderBy: String
  secondaryAxisManualSortOrder: [String!]
  omitNullValues: Boolean
  axisNameDisplay: String
  displayDataLabel: Boolean
  displayLegend: Boolean
  numberFormat: String
  rangeMin: Float
  rangeMax: Float
  color: String
  description: String
  filter: RawJSON
  groupMode: String
  layout: String
  isCumulative: Boolean
  splitMultiValueFields: Boolean
  timezone: String
  firstDayOfTheWeek: Float
}

type LineChartConfiguration {
  configurationType: String
  aggregateFieldMetadataId: UUID
  aggregateOperation: String
  primaryAxisGroupByFieldMetadataId: UUID
  primaryAxisGroupBySubFieldName: String
  primaryAxisDateGranularity: String
  primaryAxisOrderBy: String
  primaryAxisManualSortOrder: [String!]
  secondaryAxisGroupByFieldMetadataId: UUID
  secondaryAxisGroupBySubFieldName: String
  secondaryAxisGroupByDateGranularity: String
  secondaryAxisOrderBy: String
  secondaryAxisManualSortOrder: [String!]
  omitNullValues: Boolean
  axisNameDisplay: String
  displayDataLabel: Boolean
  displayLegend: Boolean
  numberFormat: String
  rangeMin: Float
  rangeMax: Float
  color: String
  description: String
  filter: RawJSON
  isStacked: Boolean
  isCumulative: Boolean
  splitMultiValueFields: Boolean
  timezone: String
  firstDayOfTheWeek: Float
}

type PieChartConfiguration {
  configurationType: String
  groupByFieldMetadataId: UUID
  aggregateFieldMetadataId: UUID
  aggregateOperation: String
  groupBySubFieldName: String
  dateGranularity: String
  orderBy: String
  manualSortOrder: [String!]
  displayDataLabel: Boolean
  showCenterMetric: Boolean
  displayLegend: Boolean
  numberFormat: String
  hideEmptyCategory: Boolean
  splitMultiValueFields: Boolean
  color: String
  description: String
  filter: RawJSON
  timezone: String
  firstDayOfTheWeek: Float
}

type AggregateChartConfiguration {
  configurationType: String
  aggregateFieldMetadataId: UUID
  aggregateOperation: String
  label: String
  displayDataLabel: Boolean
  numberFormat: String
  description: String
  filter: RawJSON
  prefix: String
  suffix: String
  timezone: String
  firstDayOfTheWeek: Float
  ratioAggregateConfig: RatioAggregateConfig
}

type IframeConfiguration { configurationType: String url: String }
type StandaloneRichTextConfiguration { configurationType: String body: RichTextBody }
type CalendarConfiguration { configurationType: String }
type EmailsConfiguration { configurationType: String }
type EmailThreadConfiguration { configurationType: String }
type CallRecordingSummaryConfiguration { configurationType: String }
type CallRecordingTranscriptConfiguration { configurationType: String }
type MessageCampaignBodyConfiguration { configurationType: String }
type MessageCampaignDetailsConfiguration { configurationType: String }

type FieldConfiguration {
  configurationType: String
  fieldDisplayMode: String
  fieldMetadataId: UUID
  viewId: UUID
  nestedRelationFieldMetadataId: UUID
  isUIEditable: Boolean
}

type FieldRichTextConfiguration { configurationType: String }

type FieldsConfiguration {
  configurationType: String
  viewId: UUID
  newFieldDefaultVisibility: Boolean
  shouldAllowUserToSeeHiddenFields: Boolean
}

type FormFieldConfiguration { configurationType: String fieldMetadataId: UUID }
type FilesConfiguration { configurationType: String }
type NotesConfiguration { configurationType: String }
type TasksConfiguration { configurationType: String }
type TimelineConfiguration { configurationType: String }
type ViewConfiguration { configurationType: String }

type RecordTableConfiguration {
  configurationType: String
  viewId: UUID
  recordLimit: Float
  isUIEditable: Boolean
}

type WorkflowConfiguration { configurationType: String }
type WorkflowRunConfiguration { configurationType: String }
type WorkflowVersionConfiguration { configurationType: String }

type FrontComponentConfiguration {
  configurationType: String
  frontComponentId: UUID
  headerCommandMenuItemUniversalIdentifiers: [String!]
}

union PageLayoutWidgetConfiguration =
    BarChartConfiguration
  | LineChartConfiguration
  | PieChartConfiguration
  | AggregateChartConfiguration
  | IframeConfiguration
  | StandaloneRichTextConfiguration
  | CalendarConfiguration
  | EmailsConfiguration
  | EmailThreadConfiguration
  | CallRecordingSummaryConfiguration
  | CallRecordingTranscriptConfiguration
  | MessageCampaignBodyConfiguration
  | MessageCampaignDetailsConfiguration
  | FieldConfiguration
  | FieldRichTextConfiguration
  | FieldsConfiguration
  | FormFieldConfiguration
  | FilesConfiguration
  | NotesConfiguration
  | TasksConfiguration
  | TimelineConfiguration
  | ViewConfiguration
  | RecordTableConfiguration
  | WorkflowConfiguration
  | WorkflowRunConfiguration
  | WorkflowVersionConfiguration
  | FrontComponentConfiguration

type PageLayoutWidgetGridPositionValue {
  column: Float
  columnSpan: Float
  row: Float
  rowSpan: Float
}

type PageLayoutWidget {
  id: UUID!
  applicationId: UUID
  universalIdentifier: UUID
  isSystemSideEffect: Boolean
  title: String
  type: String
  objectMetadataId: UUID
  createdAt: DateTime
  updatedAt: DateTime
  isActive: Boolean
  deletedAt: DateTime
  conditionalDisplay: RawJSON
  conditionalAvailabilityExpression: RawJSON
  gridPosition: PageLayoutWidgetGridPositionValue
  position: PageLayoutWidgetPosition
  configuration: PageLayoutWidgetConfiguration
  pageLayoutTabId: UUID
}

type PageLayoutTab {
  id: UUID!
  applicationId: UUID
  universalIdentifier: UUID
  isSystemSideEffect: Boolean
  title: String
  icon: String
  position: Float
  layoutMode: String
  widgets: [PageLayoutWidget!]!
  pageLayoutId: UUID!
  isActive: Boolean
  createdAt: DateTime
  updatedAt: DateTime
}

type PageLayout {
  id: UUID!
  applicationId: UUID
  name: String
  objectMetadataId: UUID
  type: String
  universalIdentifier: UUID
  isSystemSideEffect: Boolean
  isFirstTabPinned: Boolean
  defaultTabToFocusOnMobileAndSidePanelId: UUID
  createdAt: DateTime
  updatedAt: DateTime
  tabs: [PageLayoutTab!]!
}
`;
