export type Currency = { amountMicros: number | null; currencyCode: string | null } | null;
export type Links = { primaryLinkUrl: string | null; primaryLinkLabel: string | null } | null;
export type Emails = { primaryEmail: string | null } | null;
export type Phones = { primaryPhoneNumber: string | null; primaryPhoneCallingCode: string | null } | null;
export type Address = {
  addressStreet1: string | null;
  addressStreet2: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressPostcode: string | null;
  addressCountry: string | null;
} | null;

export type EtapaSituacao = 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDA';

export type Etapa = {
  id: string;
  name: string;
  ordem: number | null;
  escopo: 'MEMBRO' | 'CLUBE' | null;
  situacao: EtapaSituacao | null;
  concluidaEm: string | null;
};

export type Socio = {
  id: string;
  name: string;
  papel: string | null;
  cpf: string | null;
  cnpj: string | null;
  rg: string | null;
  nascimento: string | null;
  profissao: string | null;
  estadoCivil: string | null;
  emails: Emails;
  telefones: Phones;
  telefoneFixo: Phones;
  sexo: string | null;
  nacionalidade: string | null;
  naturalidade: string | null;
  endereco: Address;
  instagram: Links;
  linkedin: Links;
  site: Links;
  conjuge: string | null;
};

export type MembroResumo = {
  id: string;
  name: string;
  situacao: string | null;
  papel: string | null;
  emails: Emails;
  telefones: Phones;
  valorTotal: Currency;
  contratoSituacao: string | null;
};

export type ClubeResumo = {
  id: string;
  name: string;
  mentor: string | null;
  situacao: string | null;
  inicio: string | null;
  capitalNegociado: Currency;
  modeloFinanceiro: string | null;
  mouSituacao: string | null;
  mouValidade: string | null;
  responsavel: string | null;
  membros: { totalCount: number; edges: { node: { id: string; situacao: string | null } }[] };
  jornada: { edges: { node: { id: string; escopo: string | null; ordem: number | null; situacao: string | null } }[] };
};
