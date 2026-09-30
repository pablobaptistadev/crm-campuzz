import { type FieldMetadataType } from 'src/metadata/field-metadata-type';

export type CompositeProperty = {
  name: string;
  type: FieldMetadataType;
  isRequired?: boolean;
  isArray?: boolean;
  // Excluded from the generated GraphQL input or output type respectively.
  hidden?: 'input' | 'output' | true;
  isIncludedInUniqueConstraint?: boolean;
  options?: { value: string; label: string }[];
};

export type CompositeTypeDefinition = {
  type: FieldMetadataType;
  properties: CompositeProperty[];
};

// Each composite field flattens into one column per property. The column name is
// `${fieldName}${pascalCase(propertyName)}` — which is why a field literally
// named `address` produces `addressAddressCity`, not `addressCity`.
export const COMPOSITE_TYPE_DEFINITIONS: Partial<
  Record<FieldMetadataType, CompositeTypeDefinition>
> = {
  FULL_NAME: {
    type: 'FULL_NAME',
    properties: [
      { name: 'firstName', type: 'TEXT' },
      { name: 'lastName', type: 'TEXT' },
    ],
  },
  CURRENCY: {
    type: 'CURRENCY',
    properties: [
      // Stored multiplied by 1e6 to keep money exact in an integer-ish type.
      { name: 'amountMicros', type: 'NUMERIC' },
      { name: 'currencyCode', type: 'TEXT' },
    ],
  },
  LINKS: {
    type: 'LINKS',
    properties: [
      { name: 'primaryLinkLabel', type: 'TEXT' },
      {
        name: 'primaryLinkUrl',
        type: 'TEXT',
        isIncludedInUniqueConstraint: true,
      },
      { name: 'secondaryLinks', type: 'RAW_JSON' },
    ],
  },
  EMAILS: {
    type: 'EMAILS',
    properties: [
      { name: 'primaryEmail', type: 'TEXT' },
      { name: 'additionalEmails', type: 'RAW_JSON' },
    ],
  },
  PHONES: {
    type: 'PHONES',
    properties: [
      { name: 'primaryPhoneNumber', type: 'TEXT' },
      { name: 'primaryPhoneCountryCode', type: 'TEXT' },
      { name: 'primaryPhoneCallingCode', type: 'TEXT' },
      { name: 'additionalPhones', type: 'RAW_JSON' },
    ],
  },
  ADDRESS: {
    type: 'ADDRESS',
    properties: [
      { name: 'addressStreet1', type: 'TEXT' },
      { name: 'addressStreet2', type: 'TEXT' },
      { name: 'addressCity', type: 'TEXT' },
      { name: 'addressPostcode', type: 'TEXT' },
      { name: 'addressState', type: 'TEXT' },
      { name: 'addressCountry', type: 'TEXT' },
      { name: 'addressLat', type: 'NUMERIC' },
      { name: 'addressLng', type: 'NUMERIC' },
    ],
  },
  ACTOR: {
    type: 'ACTOR',
    properties: [
      {
        name: 'source',
        type: 'SELECT',
        isRequired: true,
        options: [
          { value: 'EMAIL', label: 'Email' },
          { value: 'CALENDAR', label: 'Calendar' },
          { value: 'WORKFLOW', label: 'Workflow' },
          { value: 'API', label: 'Api' },
          { value: 'IMPORT', label: 'Import' },
          { value: 'MANUAL', label: 'Manual' },
          { value: 'SYSTEM', label: 'System' },
          { value: 'WEBHOOK', label: 'Webhook' },
        ],
      },
      { name: 'workspaceMemberId', type: 'UUID', hidden: 'input' },
      { name: 'name', type: 'TEXT', hidden: 'input', isRequired: true },
      { name: 'context', type: 'RAW_JSON' },
    ],
  },
  RICH_TEXT: {
    type: 'RICH_TEXT',
    properties: [
      { name: 'blocknote', type: 'TEXT' },
      { name: 'markdown', type: 'TEXT' },
    ],
  },
};

export const isCompositeFieldMetadataType = (
  type: FieldMetadataType,
): boolean => type in COMPOSITE_TYPE_DEFINITIONS;

export const getCompositeTypeDefinitionOrThrow = (
  type: FieldMetadataType,
): CompositeTypeDefinition => {
  const definition = COMPOSITE_TYPE_DEFINITIONS[type];

  if (definition === undefined) {
    throw new Error(`${type} is not a composite field metadata type`);
  }

  return definition;
};
