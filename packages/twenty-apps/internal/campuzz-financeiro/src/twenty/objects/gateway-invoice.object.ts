import { defineObject, FieldType } from 'twenty-sdk/define';

import { GATEWAY_INVOICE } from 'src/twenty/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: GATEWAY_INVOICE.object,
  nameSingular: 'gatewayInvoice',
  namePlural: 'gatewayInvoices',
  labelSingular: 'Fatura',
  labelPlural: 'Faturas',
  description:
    'Uma cobranca de um contrato. Espelhada do gateway para dar filtro, ordenacao e soma no CRM.',
  icon: 'IconFileInvoice',
  labelIdentifierFieldMetadataUniversalIdentifier: GATEWAY_INVOICE.name,
  fields: [
    {
      universalIdentifier: GATEWAY_INVOICE.name,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Fatura',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: GATEWAY_INVOICE.externalInvoiceId,
      type: FieldType.TEXT,
      name: 'externalInvoiceId',
      label: 'Id no gateway',
      description:
        'A chave que casa esta linha com a fatura la. E por ela que o webhook e o cron atualizam em vez de duplicar.',
      icon: 'IconHash',
    },
    {
      universalIdentifier: GATEWAY_INVOICE.invoiceStatus,
      type: FieldType.SELECT,
      name: 'invoiceStatus',
      label: 'Situacao',
      icon: 'IconProgress',
      defaultValue: "'PENDING'",
      options: [
        {
          id: '8f2e66a3-ebe3-43d6-8fdb-d3d742b5b7c4',
          value: 'PAID',
          label: 'Paga',
          position: 0,
          color: 'green',
        },
        {
          id: 'a3023862-4818-4e32-8ecc-c61ade39aab0',
          value: 'PENDING',
          label: 'Pendente',
          position: 1,
          color: 'blue',
        },
        {
          id: 'c4759b83-f2b5-45c6-a390-c3c95842aee4',
          value: 'WAITING_PAYMENT',
          label: 'Aguardando pagamento',
          position: 2,
          color: 'yellow',
        },
        {
          id: '4b15ad4c-bccb-458f-940f-c1eb01ea5006',
          value: 'OVERDUE',
          label: 'Vencida',
          position: 3,
          color: 'red',
        },
        {
          id: '03ed73e2-fc81-42da-b055-d6f4a4bc4bda',
          value: 'EXPIRED',
          label: 'Expirada',
          position: 4,
          color: 'gray',
        },
        {
          id: 'f1c4b607-f356-4350-9286-d58056cbd1d5',
          value: 'CANCELED',
          label: 'Cancelada',
          position: 5,
          color: 'gray',
        },
      ],
    },
    {
      universalIdentifier: GATEWAY_INVOICE.amount,
      type: FieldType.CURRENCY,
      name: 'amount',
      label: 'Valor',
      icon: 'IconCurrencyReal',
      isNullable: true,
    },
    {
      universalIdentifier: GATEWAY_INVOICE.dueAt,
      type: FieldType.DATE_TIME,
      name: 'dueAt',
      label: 'Vencimento',
      icon: 'IconCalendarDue',
      isNullable: true,
    },
    {
      universalIdentifier: GATEWAY_INVOICE.paidAt,
      type: FieldType.DATE_TIME,
      name: 'paidAt',
      label: 'Pagamento',
      icon: 'IconCalendarCheck',
      isNullable: true,
    },
    {
      universalIdentifier: GATEWAY_INVOICE.paymentUrl,
      type: FieldType.LINKS,
      name: 'paymentUrl',
      label: 'Link de pagamento',
      icon: 'IconLink',
      isNullable: true,
    },
  ],
});
