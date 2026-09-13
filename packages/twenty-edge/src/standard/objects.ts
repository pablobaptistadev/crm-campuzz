import {
  buildStandardObject,
  type StandardObjectInput,
} from 'src/standard/build';
import { type FlatObjectMetadata } from 'src/metadata/types';

const MANY_TO_ONE = {
  relationType: 'MANY_TO_ONE',
  onDelete: 'SET_NULL',
} as const;

const ONE_TO_MANY = { relationType: 'ONE_TO_MANY' } as const;

// The CRM core. Messaging, calendar, workflow and dashboard objects are
// deliberately out of the first cut.
export const STANDARD_OBJECT_INPUTS: StandardObjectInput[] = [
  {
    nameSingular: 'workspaceMember',
    namePlural: 'workspaceMembers',
    labelSingular: 'Workspace Member',
    labelPlural: 'Workspace Members',
    icon: 'IconUserCircle',
    isSystem: true,
    fields: [
      { name: 'name', label: 'Name', type: 'FULL_NAME' },
      { name: 'colorScheme', label: 'Color Scheme', type: 'TEXT' },
      { name: 'locale', label: 'Language', type: 'TEXT' },
      { name: 'avatarUrl', label: 'Avatar Url', type: 'TEXT' },
      { name: 'userEmail', label: 'User Email', type: 'TEXT' },
      { name: 'userId', label: 'User Id', type: 'UUID' },
      // Both sides of a relation must exist: the front dereferences
      // relation.targetFieldMetadata.id without a guard, so a MANY_TO_ONE
      // without its inverse crashes every page that renders the owning object.
      {
        name: 'authoredAttachments',
        label: 'Authored attachments',
        type: 'RELATION',
        settings: ONE_TO_MANY,
        relationTargetObjectNameSingular: 'attachment',
        relationTargetFieldName: 'author',
      },
      {
        name: 'assignedTasks',
        label: 'Assigned tasks',
        type: 'RELATION',
        settings: ONE_TO_MANY,
        relationTargetObjectNameSingular: 'task',
        relationTargetFieldName: 'assignee',
      },
    ],
  },
  {
    nameSingular: 'company',
    namePlural: 'companies',
    labelSingular: 'Company',
    labelPlural: 'Companies',
    icon: 'IconBuildingSkyscraper',
    fields: [
      { name: 'name', label: 'Name', type: 'TEXT' },
      { name: 'domainName', label: 'Domain Name', type: 'LINKS' },
      { name: 'address', label: 'Address', type: 'ADDRESS' },
      { name: 'employees', label: 'Employees', type: 'NUMBER' },
      { name: 'linkedinLink', label: 'Linkedin', type: 'LINKS' },
      { name: 'annualRecurringRevenue', label: 'ARR', type: 'CURRENCY' },
      { name: 'idealCustomerProfile', label: 'ICP', type: 'BOOLEAN' },
      {
        name: 'people',
        label: 'People',
        type: 'RELATION',
        settings: ONE_TO_MANY,
        relationTargetObjectNameSingular: 'person',
        relationTargetFieldName: 'company',
      },
      {
        name: 'opportunities',
        label: 'Opportunities',
        type: 'RELATION',
        settings: ONE_TO_MANY,
        relationTargetObjectNameSingular: 'opportunity',
        relationTargetFieldName: 'company',
      },
    ],
  },
  {
    nameSingular: 'person',
    namePlural: 'people',
    labelSingular: 'Person',
    labelPlural: 'People',
    icon: 'IconUser',
    fields: [
      { name: 'name', label: 'Name', type: 'FULL_NAME' },
      { name: 'emails', label: 'Emails', type: 'EMAILS' },
      { name: 'phones', label: 'Phones', type: 'PHONES' },
      { name: 'jobTitle', label: 'Job Title', type: 'TEXT' },
      { name: 'city', label: 'City', type: 'TEXT' },
      { name: 'avatarUrl', label: 'Avatar', type: 'TEXT' },
      { name: 'linkedinLink', label: 'Linkedin', type: 'LINKS' },
      {
        name: 'company',
        label: 'Company',
        type: 'RELATION',
        settings: MANY_TO_ONE,
        relationTargetObjectNameSingular: 'company',
        relationTargetFieldName: 'people',
      },
    ],
  },
  {
    nameSingular: 'opportunity',
    namePlural: 'opportunities',
    labelSingular: 'Opportunity',
    labelPlural: 'Opportunities',
    icon: 'IconTargetArrow',
    fields: [
      { name: 'name', label: 'Name', type: 'TEXT' },
      { name: 'amount', label: 'Amount', type: 'CURRENCY' },
      { name: 'closeDate', label: 'Close date', type: 'DATE_TIME' },
      {
        name: 'stage',
        label: 'Stage',
        type: 'SELECT',
        defaultValue: 'NEW',
        options: [
          { value: 'NEW', label: 'New', color: 'red', position: 0 },
          { value: 'SCREENING', label: 'Screening', color: 'purple', position: 1 },
          { value: 'MEETING', label: 'Meeting', color: 'sky', position: 2 },
          { value: 'PROPOSAL', label: 'Proposal', color: 'turquoise', position: 3 },
          { value: 'CUSTOMER', label: 'Customer', color: 'yellow', position: 4 },
        ],
      },
      {
        name: 'company',
        label: 'Company',
        type: 'RELATION',
        settings: MANY_TO_ONE,
        relationTargetObjectNameSingular: 'company',
        relationTargetFieldName: 'opportunities',
      },
    ],
  },
  {
    nameSingular: 'note',
    namePlural: 'notes',
    labelSingular: 'Note',
    labelPlural: 'Notes',
    icon: 'IconNotes',
    labelIdentifierFieldName: 'title',
    fields: [
      { name: 'title', label: 'Title', type: 'TEXT' },
      { name: 'body', label: 'Body', type: 'RICH_TEXT' },
    ],
  },
  {
    nameSingular: 'task',
    namePlural: 'tasks',
    labelSingular: 'Task',
    labelPlural: 'Tasks',
    icon: 'IconCheckbox',
    labelIdentifierFieldName: 'title',
    fields: [
      { name: 'title', label: 'Title', type: 'TEXT' },
      { name: 'body', label: 'Body', type: 'RICH_TEXT' },
      { name: 'dueAt', label: 'Due Date', type: 'DATE_TIME' },
      {
        name: 'status',
        label: 'Status',
        type: 'SELECT',
        defaultValue: 'TODO',
        options: [
          { value: 'TODO', label: 'To do', color: 'sky', position: 0 },
          { value: 'IN_PROGRESS', label: 'In progress', color: 'purple', position: 1 },
          { value: 'DONE', label: 'Done', color: 'green', position: 2 },
        ],
      },
      {
        name: 'assignee',
        label: 'Assignee',
        type: 'RELATION',
        settings: MANY_TO_ONE,
        relationTargetObjectNameSingular: 'workspaceMember',
        relationTargetFieldName: 'assignedTasks',
      },
    ],
  },
  {
    nameSingular: 'attachment',
    namePlural: 'attachments',
    labelSingular: 'Attachment',
    labelPlural: 'Attachments',
    icon: 'IconFileImport',
    fields: [
      { name: 'name', label: 'Name', type: 'TEXT' },
      { name: 'fullPath', label: 'Full path', type: 'TEXT' },
      { name: 'type', label: 'Type', type: 'TEXT' },
      {
        name: 'author',
        label: 'Author',
        type: 'RELATION',
        settings: MANY_TO_ONE,
        relationTargetObjectNameSingular: 'workspaceMember',
        relationTargetFieldName: 'authoredAttachments',
      },
    ],
  },
  {
    nameSingular: 'timelineActivity',
    namePlural: 'timelineActivities',
    labelSingular: 'Timeline Activity',
    labelPlural: 'Timeline Activities',
    icon: 'IconTimelineEvent',
    isSystem: true,
    labelIdentifierFieldName: 'name',
    fields: [
      { name: 'name', label: 'Event name', type: 'TEXT' },
      { name: 'properties', label: 'Event details', type: 'RAW_JSON' },
      { name: 'happensAt', label: 'Creation date', type: 'DATE_TIME', defaultValue: 'now' },
      { name: 'linkedRecordId', label: 'Linked Record id', type: 'UUID' },
      { name: 'linkedRecordCachedName', label: 'Linked Record cached name', type: 'TEXT' },
      { name: 'linkedObjectMetadataId', label: 'Linked Object Metadata Id', type: 'UUID' },
    ],
  },
];

export const buildStandardObjects = (
  workspaceId: string,
): FlatObjectMetadata[] =>
  STANDARD_OBJECT_INPUTS.map((input) =>
    buildStandardObject({ input, workspaceId }),
  );
