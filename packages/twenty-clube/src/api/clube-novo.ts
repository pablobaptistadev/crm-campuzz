// As mesmas etapas que os clubes importados têm, para um clube novo abrir com a
// aba CRM preenchida em vez de vazia.
export const JORNADA_CLUBE = [
  'Check Out',
  'Pagamento entrada',
  'Grupo De Whatsapp Individual',
  'Formulário Cadastro Unifast',
  'Onboarding Inicial',
  'MOU Enviado',
  'MOU Assinado',
  'Grupo de Whatsapp Geral',
  'Kickoff Francelino (ACN)',
  'Formulário Pitch Deck',
  'Onboarding Mkt',
  'Contrato MLS Enviado',
  'Contrato MLS Assinado',
  'Onboarding Operacional',
  'Onboarding Campuzz',
  'Education ID',
  'Contrato Partners Enviado',
  'Contrato Partners Assinado',
];

export const PIPELINE_CLUBE = [
  'MOU',
  'Pgto',
  'Checkout',
  'Pitch Deck',
  'Onboarding',
  'Mentorados',
];

export const JORNADA_MEMBRO = [
  'Check Out',
  'Pagamento entrada',
  'Grupo De Whatsapp Individual',
  'Education Base',
  'Onboarding',
  'Contrato Enviado',
  'Contrato Assinado',
  'Grupo de Whatsapp Geral',
  'Cadastro MLS',
  'Cadastro Campus',
  'Onboarding Sistemas',
  'Education ID',
];

export const CRIAR_CLUBE = `
  mutation CriarClube($data: ClubeCreateInput!) {
    createClube(data: $data) { id name }
  }
`;

export const CRIAR_ETAPAS = `
  mutation CriarEtapas($data: [EtapaJornadaCreateInput!]!) {
    createEtapasJornada(data: $data) { id }
  }
`;

export const CRIAR_MEMBRO = `
  mutation CriarMembro($data: MembroCreateInput!) {
    createMembro(data: $data) { id name }
  }
`;

export const CRIAR_SOCIO = `
  mutation CriarSocio($data: SocioCreateInput!) {
    createSocio(data: $data) { id name }
  }
`;
