import { defineObject, FieldType } from 'twenty-sdk/define';

import { BUSINESS_UNIT } from 'src/twenty/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: BUSINESS_UNIT.object,
  nameSingular: 'businessUnit',
  namePlural: 'businessUnits',
  labelSingular: 'BU',
  labelPlural: 'BUs',
  description:
    'Um par de chaves de gateway. Cada BU e um bus proprio: evento de uma nunca chega pelo caminho de outra.',
  icon: 'IconBuildingBank',
  labelIdentifierFieldMetadataUniversalIdentifier: BUSINESS_UNIT.name,
  fields: [
    {
      universalIdentifier: BUSINESS_UNIT.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Nome',
      description: 'Como reconhecemos esta BU na lista',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: BUSINESS_UNIT.gatewayProvider,
      type: FieldType.SELECT,
      name: 'gatewayProvider',
      label: 'Gateway',
      icon: 'IconPlug',
      defaultValue: "'ROUTERFY'",
      options: [
        {
          id: '88757f41-713d-4849-8fa3-33525033eef9',
          value: 'ROUTERFY',
          label: 'Routerfy',
          position: 0,
          color: 'blue',
        },
      ],
    },
    {
      universalIdentifier: BUSINESS_UNIT.apiKeyPreview,
      type: FieldType.TEXT,
      name: 'apiKeyPreview',
      label: 'Chave (inicio)',
      description:
        'So o comeco da api key, para reconhecer a BU. A chave inteira nunca fica em campo de registro.',
      icon: 'IconKey',
    },
    {
      universalIdentifier: BUSINESS_UNIT.keyFingerprint,
      type: FieldType.TEXT,
      name: 'keyFingerprint',
      label: 'Impressao da chave',
      description: 'Hash da api key. Serve para casar o evento com esta BU.',
      icon: 'IconFingerprint',
    },
    {
      universalIdentifier: BUSINESS_UNIT.webhookRegistrationId,
      type: FieldType.TEXT,
      name: 'webhookRegistrationId',
      label: 'Id do bus',
      description: 'O identificador que vai na URL de webhook desta BU',
      icon: 'IconRouter',
      isNullable: true,
    },
    {
      universalIdentifier: BUSINESS_UNIT.gatewayWebhookId,
      type: FieldType.TEXT,
      name: 'gatewayWebhookId',
      label: 'Webhook no gateway',
      description: 'Id do registro no gateway. Serve para remove-lo depois.',
      icon: 'IconWebhook',
      isNullable: true,
    },
    {
      universalIdentifier: BUSINESS_UNIT.connectionStatus,
      type: FieldType.SELECT,
      name: 'connectionStatus',
      label: 'Situacao',
      icon: 'IconProgress',
      defaultValue: "'PENDING'",
      options: [
        {
          id: '7ebe020e-6b45-43a2-a74a-e6a294602312',
          value: 'ACTIVE',
          label: 'Ativa',
          position: 0,
          color: 'green',
        },
        {
          id: '1ab1cdcb-b02e-40ec-8474-085226a5e0cc',
          value: 'INVALID',
          label: 'Chaves invalidas',
          position: 1,
          color: 'red',
        },
        {
          id: '8e7b870c-00c3-4702-b27b-7f398df2404c',
          value: 'PENDING',
          label: 'Pendente',
          position: 2,
          color: 'gray',
        },
      ],
    },
    {
      universalIdentifier: BUSINESS_UNIT.lastValidatedAt,
      type: FieldType.DATE_TIME,
      name: 'lastValidatedAt',
      label: 'Validada em',
      icon: 'IconClockCheck',
      isNullable: true,
    },
    {
      universalIdentifier: BUSINESS_UNIT.isDefault,
      type: FieldType.BOOLEAN,
      name: 'isDefault',
      label: 'BU padrao',
      description:
        'Usada por quem nao tem BU propria nem herda a do clube. So uma pode estar marcada.',
      icon: 'IconStar',
      defaultValue: false,
    },
  ],
});
