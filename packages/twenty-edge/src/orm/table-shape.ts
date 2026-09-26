import {
  getCompositeTypeDefinitionOrThrow,
  isCompositeFieldMetadataType,
} from 'src/metadata/composite-types';
import { type FieldMetadataType } from 'src/metadata/field-metadata-type';
import {
  computeColumnName,
  computeMorphFieldName,
  computeCompositeColumnName,
  computeTableName,
  getWorkspaceSchemaName,
} from 'src/metadata/naming';
import { type FlatObjectMetadata } from 'src/metadata/types';

export type ColumnShape = {
  columnName: string;
  fieldName: string;
  fieldType: FieldMetadataType;
  // Set when this column is one property of a composite field, so results can
  // be rehydrated back into a nested object.
  compositeParentFieldName: string | null;
  compositePropertyName: string | null;
};

export type RelationShape = {
  fieldName: string;
  joinColumnName: string;
  targetObjectMetadataId: string;
  relationType: 'MANY_TO_ONE' | 'ONE_TO_MANY';
};

export type WorkspaceTableShape = {
  objectMetadataId: string;
  nameSingular: string;
  schemaName: string;
  tableName: string;
  columnShapeByColumnName: Map<string, ColumnShape>;
  relationShapeByFieldName: Map<string, RelationShape>;
  hasDeletedAtColumn: boolean;
};

export const buildWorkspaceTableShape = ({
  object,
  workspaceId,
}: {
  object: FlatObjectMetadata;
  workspaceId: string;
}): WorkspaceTableShape => {
  const columnShapeByColumnName = new Map<string, ColumnShape>();
  const relationShapeByFieldName = new Map<string, RelationShape>();

  for (const field of object.fields) {
    if (!field.isActive) {
      continue;
    }

    if (field.type === 'RELATION' || field.type === 'MORPH_RELATION') {
      const relationType = field.settings?.relationType;

      if (relationType === undefined) {
        continue;
      }

      const morphTargets = field.settings?.morphTargets ?? [];

      // A morph relation owns one column per target, each named after the
      // target object, so the shape carries all of them.
      if (field.type === 'MORPH_RELATION' && morphTargets.length > 0) {
        if (relationType !== 'MANY_TO_ONE') {
          continue;
        }

        for (const morphTarget of morphTargets) {
          const morphFieldName = computeMorphFieldName({
            fieldName: field.name,
            relationType,
            nameSingular: morphTarget.nameSingular,
            namePlural: morphTarget.namePlural,
          });
          const morphColumnName = computeColumnName(morphFieldName, {
            isForeignKey: true,
          });

          relationShapeByFieldName.set(morphFieldName, {
            fieldName: morphFieldName,
            joinColumnName: morphColumnName,
            targetObjectMetadataId: morphTarget.objectMetadataId,
            relationType,
          });

          columnShapeByColumnName.set(morphColumnName, {
            columnName: morphColumnName,
            fieldName: morphFieldName,
            fieldType: 'UUID',
            compositeParentFieldName: null,
            compositePropertyName: null,
          });
        }

        continue;
      }

      const joinColumnName = computeColumnName(field.name, {
        isForeignKey: true,
      });

      relationShapeByFieldName.set(field.name, {
        fieldName: field.name,
        joinColumnName,
        targetObjectMetadataId: field.relationTargetObjectMetadataId ?? '',
        relationType,
      });

      if (relationType === 'MANY_TO_ONE') {
        columnShapeByColumnName.set(joinColumnName, {
          columnName: joinColumnName,
          fieldName: field.name,
          fieldType: 'UUID',
          compositeParentFieldName: null,
          compositePropertyName: null,
        });
      }

      continue;
    }

    if (isCompositeFieldMetadataType(field.type)) {
      for (const property of getCompositeTypeDefinitionOrThrow(field.type)
        .properties) {
        const columnName = computeCompositeColumnName(field.name, property);

        columnShapeByColumnName.set(columnName, {
          columnName,
          fieldName: field.name,
          fieldType: property.type,
          compositeParentFieldName: field.name,
          compositePropertyName: property.name,
        });
      }

      continue;
    }

    const columnName = computeColumnName(field.name);

    columnShapeByColumnName.set(columnName, {
      columnName,
      fieldName: field.name,
      fieldType: field.type,
      compositeParentFieldName: null,
      compositePropertyName: null,
    });
  }

  return {
    objectMetadataId: object.id,
    nameSingular: object.nameSingular,
    schemaName: getWorkspaceSchemaName(workspaceId),
    tableName: computeTableName(object.nameSingular, object.isCustom),
    columnShapeByColumnName,
    relationShapeByFieldName,
    hasDeletedAtColumn: columnShapeByColumnName.has('deletedAt'),
  };
};

export const buildColumnResultAlias = ({
  alias,
  columnName,
}: {
  alias: string;
  columnName: string;
}): string => `${alias}_${columnName}`;
