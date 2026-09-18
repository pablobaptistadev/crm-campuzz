/**
 * Identificadores universais do app, num lugar so.
 *
 * Eles sao a identidade de cada objeto, campo e funcao entre instalacoes: mudar
 * um depois que o app foi instalado faz o Twenty tratar a entidade como nova e
 * perder o vinculo com a antiga. Por isso ficam aqui, longe do codigo que muda.
 */
export const BUSINESS_UNIT = {
  object: '3f5da777-c594-4d54-bff8-9df68f952ee8',
  name: '3fcd5f73-cd95-4da1-916e-78a5a0f57f44',
  gatewayProvider: 'e9d6a9f7-cb08-4562-8403-5d127869470f',
  apiKeyPreview: '49a4a00b-c552-4ebf-a728-4872e1de8cd9',
  keyFingerprint: '1c859dc5-8fee-4aa3-b306-ccd5e265940c',
  webhookRegistrationId: 'dd4f43c8-afee-49c8-87db-8199beb804f6',
  gatewayWebhookId: 'a717ecac-045b-4d30-adca-e0c04bab6783',
  connectionStatus: 'eb222ec2-fdd4-49f8-bb79-43712aa133c3',
  lastValidatedAt: '98d33be1-7de4-4264-9c6e-1d5ff249eba3',
  isDefault: 'e6ee5513-782c-4bde-9bdf-71b2ab4a0b08',
} as const;

export const GATEWAY_CONTRACT = {
  object: '15e36d3a-0d91-4d91-8edd-3ca561ac53f9',
  name: 'cf0eb604-3759-4dfe-adcf-9fd065109429',
  externalSubscriptionId: '8a12e0ce-8f1b-43f3-8b25-16baceca84c6',
  externalTransactionId: '96022822-7fbd-497a-85c9-c463c77301ff',
  contractKind: '156b5a4d-8150-4f40-bc72-fc68b814b731',
  contractStatus: 'e9fdb44d-32f4-4ba4-b217-02b2c77bf62c',
  amount: 'cab9f9c8-4a45-4854-9136-8bd87f2ab3d3',
  totalValue: '17bf4fa0-e843-4c92-9dd4-b2b334d15fec',
  frequency: '8698d7d1-6cdc-4b34-94db-0fb2cd2a2f44',
  frequencyInterval: '61461df4-1c4c-4e43-97ab-df49c7468826',
  startsAt: '5a075a3b-7ef8-47a9-8c6f-9a296e029378',
  endsAt: 'b676b612-8351-4177-b9bc-b4872c037179',
  nextChargeAt: '8db422be-49f9-42d1-8cdc-38326ef9803e',
  paidInvoicesCount: '11084552-ab59-4efa-a0f5-0a0bdcd58621',
  paymentMethod: 'f52cd628-f0e6-4136-a202-e33afd65e436',
  customerEmail: 'b9da15f8-add8-4ef1-9ee6-d5096b8808bd',
  customerDocument: '9690d5e7-3642-4230-9e24-2293ba0fe521',
} as const;

export const GATEWAY_INVOICE = {
  object: '0b050a09-dfda-4550-9cc1-7a9cb3a9536e',
  name: 'ac4f1425-4c61-4fe3-92df-c9c8e41a1c25',
  externalInvoiceId: 'deca6ea4-4d94-4009-9a97-5255c9b59ffd',
  invoiceStatus: 'd4fa06a1-052c-4198-b157-e63ba3bb130d',
  amount: 'e6730a73-a94d-491a-8c43-7dc4b64f905e',
  dueAt: 'ef346cac-c7df-44f5-9f51-1fd9c7d4f00d',
  paidAt: '64f717d6-583c-40b2-86c8-0d41733ad66b',
  paymentUrl: '34098992-b55e-44c5-bd29-5aa5e85dee9d',
} as const;

/** Relacoes. Cada uma precisa dos dois lados declarados. */
export const RELATIONS = {
  businessUnitOnCompany: 'fe04f889-c6aa-4872-93fc-f23830cd9ddd',
  companiesOnBusinessUnit: 'ce4cf2c6-43c8-43eb-b11c-a606956b21a4',
  businessUnitOnPerson: '6e41ef9b-1b25-4345-b97c-cf55eb1ea36f',
  peopleOnBusinessUnit: '8a7ade0a-1136-41c0-88d9-77a787c6d08f',
  businessUnitOnContract: 'd025fcf0-6982-48ea-b2d0-2e390d3eeebd',
  contractsOnBusinessUnit: 'ab808d35-af28-4a58-880b-b9b0c47ef3cc',
  companyOnContract: 'a81e7107-027d-44db-966f-761f6a8e511d',
  contractsOnCompany: 'b2162a99-c056-4ce8-89e8-be25a91d28f2',
  personOnContract: '3c6817c0-a926-4bbb-843a-4d549bdebcfb',
  contractsOnPerson: 'e90a1037-c6ee-423d-a80e-47b79a890395',
  contractOnInvoice: 'f26d3350-15d6-4a73-bd26-385eb7b84f50',
  invoicesOnContract: '503b38a0-ad55-4861-b2fc-500036d5d6d0',
  billingEmailsOnCompany: '4aeab43e-fd4c-43f3-8871-ddade3f47e91',
} as const;

export const LOGIC_FUNCTIONS = {
  saveBusinessUnit: '6d2a510c-f8ca-430c-a762-4bb35f2573c2',
  listBusinessUnits: '28e73910-085a-4b4d-b1c9-0b9b101e68ba',
  previewContract: '33e69fc6-3185-4ae5-8315-9a537e61f12a',
  attachContract: '136e1e69-2a39-41a7-b611-07cce98c05d1',
  webhookResolver: '21645f6c-8ad6-4890-980b-9c82a9c13c16',
  webhookTarget: '2fcb1a48-6977-44ae-8f30-51d950f16561',
  syncContracts: 'c04241d4-b28b-4f79-8365-fd8b581278b1',
  syncHolderContracts: '4e9c0cb7-dfcf-48ca-b6d9-fd2bebdd7adc',
} as const;

export const FRONT_COMPONENTS = {
  adicionarContratoMembro: 'a59fb15f-4059-4897-92a7-ad7afd3c3db8',
  adicionarContratoClube: '1b1e4c5e-f9bd-4f41-9159-3d2b1015ed4a',
  financeiroClube: 'db58405d-ff1c-4a1a-bc96-ce218510fadc',
  financeiroMembro: '83014ade-1473-4d1b-9f63-53f249b0fcb2',
} as const;

export const COMMAND_MENU_ITEMS = {
  adicionarContratoMembro: 'fac8c583-33a6-4819-bcdb-625c68ec1698',
  adicionarContratoClube: '77769a13-7012-4a81-86d6-55515b6ecc56',
} as const;

export const VIEWS = {
  faturasAPagar: 'e4685101-d2e1-4c72-86d8-ea75bd20c1a4',
  faturasPagas: 'b52c1955-fcb2-41c1-9cea-b59e4025dc1d',
  contratosAtivos: '22ecf26b-9b3a-4b0c-a45e-acd836f91208',
  businessUnits: 'c67b22be-79d6-4458-ae18-10df512f0a99',
} as const;


/**
 * Caminhos das rotas autenticadas que o popup chama.
 *
 * O front chama como `${TWENTY_API_URL}/s<path>` com o token da aplicacao. Nao
 * confundir com o resolver de webhook: aquele e publico e o caminho dele e
 * derivado do universalIdentifier pelo proprio servidor.
 */
export const ROUTES = {
  saveBusinessUnit: '/campuzz-financeiro/bu/salvar',
  listBusinessUnits: '/campuzz-financeiro/bu/listar',
  previewContract: '/campuzz-financeiro/contrato/validar',
  attachContract: '/campuzz-financeiro/contrato/vincular',
  syncHolderContracts: '/campuzz-financeiro/financeiro/sincronizar',
} as const;

/** Views usadas dentro dos widgets das abas, nao nos seletores de view. */
export const WIDGET_VIEWS = {
  contratosDoClube: '5763f613-7c51-436c-bdf0-e7556efe3f84',
  contratosDoMembro: 'cefb0c7f-c05a-4611-ac3e-7cf4d28084cd',
  faturasAPagarWidget: 'f35c20b6-6850-4af9-b685-70e7bd8c6511',
  faturasPagasWidget: '615f168f-0e76-405a-b558-8e78158220e5',
} as const;

export const PAGE_LAYOUT_TABS = {
  financeiroClube: '645932e1-1e11-4139-bba6-901c15380bce',
  financeiroMembro: 'eaef702a-0cf5-45d1-b270-8397a5a91c3f',
} as const;

export const PAGE_LAYOUT_WIDGETS = {
  contratosClube: '46627a45-3ec1-4af8-b623-9da4d0a2b838',
  faturasAPagarClube: 'c412cc18-20ba-40ad-9d75-519d998834cd',
  faturasPagasClube: '29ef3b7a-38ba-486c-864d-c477a0ce6d7e',
  contratosMembro: 'fdfbd589-0572-4129-bffd-71fe1611dbed',
  faturasAPagarMembro: '2d99684a-1904-4ded-a165-0ecafa03d0fc',
  faturasPagasMembro: 'df7d2e9d-4893-4204-86c0-5d00933b7235',
  painelClube: 'ca00d37b-d24a-449f-a9bc-d86e1fd6d396',
  painelMembro: '63efc1ce-1c54-4ea5-b35c-14e944cb3133',
} as const;

/**
 * Indices unicos sobre os ids externos.
 *
 * A trava de duplicata do caso de uso consulta antes de gravar, mas consulta e
 * gravacao nao sao atomicas: duas pessoas vinculando o mesmo contrato ao mesmo
 * tempo passam as duas pela consulta. O unico no banco e o que fecha essa
 * janela — e e tambem o que garante a idempotencia do upsert de fatura.
 */
export const INDEXES = {
  contractSubscription: '4aeab43e-fd4c-43f3-8871-ddade3f47e92',
  contractTransaction: '6d2a510c-f8ca-430c-a762-4bb35f2573c3',
  invoiceExternalId: '28e73910-085a-4b4d-b1c9-0b9b101e68bb',
} as const;

export const INDEX_FIELDS = {
  contractSubscription: '33e69fc6-3185-4ae5-8315-9a537e61f12b',
  contractTransaction: '136e1e69-2a39-41a7-b611-07cce98c05d2',
  invoiceExternalId: '21645f6c-8ad6-4890-980b-9c82a9c13c17',
} as const;
