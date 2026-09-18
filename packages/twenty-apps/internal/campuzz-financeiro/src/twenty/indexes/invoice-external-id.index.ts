import { defineIndex } from 'twenty-sdk/define';

import {
  GATEWAY_INVOICE,
  INDEX_FIELDS,
  INDEXES,
} from 'src/twenty/constants/universal-identifiers';

/**
 * A chave de idempotencia do financeiro.
 *
 * Tres caminhos gravam a mesma fatura — o vinculo inicial, o webhook e o cron.
 * O upsert casa por este id; o unico e o que garante que ele tem um alvo so.
 */
export default defineIndex({
  universalIdentifier: INDEXES.invoiceExternalId,
  objectUniversalIdentifier: GATEWAY_INVOICE.object,
  isUnique: true,
  fields: [
    {
      universalIdentifier: INDEX_FIELDS.invoiceExternalId,
      fieldUniversalIdentifier: GATEWAY_INVOICE.externalInvoiceId,
    },
  ],
});
