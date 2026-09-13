import { describe, expect, it } from 'vitest';

import { type FlatObjectMetadata } from 'src/metadata/types';
import { buildWorkspaceTableShape } from 'src/orm/table-shape';
import {
  buildGroupByDimensions,
  buildGroupByQuery,
} from 'src/services/group-by';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';

const object: FlatObjectMetadata = {
  id: 'object-opportunity',
  workspaceId: WORKSPACE_ID,
  nameSingular: 'opportunity',
  namePlural: 'opportunities',
  labelSingular: 'Opportunity',
  labelPlural: 'Opportunities',
  description: null,
  icon: null,
  isActive: true,
  isSystem: false,
  isCustom: false,
  isSearchable: true,
  labelIdentifierFieldMetadataId: null,
  imageIdentifierFieldMetadataId: null,
  fields: (
    [
      ['id', 'UUID'],
      ['name', 'TEXT'],
      ['stage', 'SELECT'],
      ['closeDate', 'DATE_TIME'],
      ['deletedAt', 'DATE_TIME'],
    ] as const
  ).map(([name, type]) => ({
    id: `field-${name}`,
    objectMetadataId: 'object-opportunity',
    workspaceId: WORKSPACE_ID,
    name,
    label: name,
    type,
    description: null,
    icon: null,
    isActive: true,
    isSystem: false,
    isNullable: true,
    isUnique: false,
    defaultValue: null,
    options: null,
    settings: null,
    relationTargetFieldMetadataId: null,
    relationTargetObjectMetadataId: null,
  })),
};

const shape = buildWorkspaceTableShape({ object, workspaceId: WORKSPACE_ID });

const dimensionsFor = (groupBy: Parameters<typeof buildGroupByDimensions>[0]['groupBy']) =>
  buildGroupByDimensions({ shape, alias: 'opportunity', groupBy });

describe('buildGroupByDimensions', () => {
  it('takes one dimension per entry, in order', () => {
    expect(
      dimensionsFor([{ stage: true }, { name: true }]).map(
        (dimension) => dimension.fieldName,
      ),
    ).toEqual(['stage', 'name']);
  });

  it('ignores a field turned off and one that does not exist', () => {
    expect(dimensionsFor([{ stage: false }, { nope: true }])).toEqual([]);
  });

  it('buckets a date by its granularity', () => {
    expect(dimensionsFor([{ closeDate: { granularity: 'MONTH' } }])[0].expression)
      .toContain(`date_trunc('month'`);
  });

  // Midnight in São Paulo is 03:00 UTC, so grouping by day without the zone
  // files the evening under the next day.
  it('shifts to the time zone before truncating', () => {
    const expression = dimensionsFor([
      { closeDate: { granularity: 'DAY', timeZone: 'America/Sao_Paulo' } },
    ])[0].expression;

    expect(expression).toContain(`AT TIME ZONE 'America/Sao_Paulo'`);
    expect(expression).toContain(`date_trunc('day'`);
  });

  it('leaves the column alone when the granularity is NONE', () => {
    expect(
      dimensionsFor([{ closeDate: { granularity: 'NONE' } }])[0].expression,
    ).not.toContain('date_trunc');
  });
});

describe('buildGroupByQuery', () => {
  it('groups and counts, excluding soft-deleted rows', () => {
    const { text } = buildGroupByQuery({
      shape,
      dimensions: dimensionsFor([{ stage: true }]),
    });

    expect(text).toContain('count(*)::int AS "totalCount"');
    expect(text).toContain('GROUP BY 1');
    expect(text).toContain(`"deletedAt" IS NULL`);
  });

  // An unset column is the kanban's trailing "no value" lane, not its first.
  it('sorts nulls last', () => {
    const { text } = buildGroupByQuery({
      shape,
      dimensions: dimensionsFor([{ stage: true }]),
    });

    expect(text).toContain('ORDER BY 1 ASC NULLS LAST');
  });

  it('carries the caller filter into the same statement', () => {
    const { text, values } = buildGroupByQuery({
      shape,
      dimensions: dimensionsFor([{ stage: true }]),
      filter: { name: { eq: 'Acme' } },
    });

    expect(values).toContain('Acme');
    expect(text).toContain('WHERE');
  });
});
