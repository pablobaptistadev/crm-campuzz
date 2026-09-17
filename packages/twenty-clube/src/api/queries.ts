import { type ObjetoMeta } from './metadata';
import { selecaoDeCampos } from './selecao';

const ETAPA = `
  id name ordem escopo situacao concluidaEm observacoes responsavel prazo
  attachments { edges { node { id name fullPath type } } }
`;
const MOEDA = `{ amountMicros currencyCode }`;
const LINK = `{ primaryLinkUrl primaryLinkLabel }`;
const EMAIL = `{ primaryEmail }`;
const FONE = `{ primaryPhoneNumber primaryPhoneCallingCode }`;
const ENDERECO = `{ addressStreet1 addressStreet2 addressCity addressState addressPostcode addressCountry }`;

// O painel usa três consultas achatadas em vez de uma aninhada: uma relação
// to-many dentro de 38 clubes vira 76 idas ao banco e a tela fica em branco.
export const CLUBES_QUERY = `
  query Clubes($after: String) {
    clubes(first: 60, after: $after) {
      totalCount
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id name mentor situacao inicio responsavel modeloFinanceiro
          capitalNegociado ${MOEDA}
          mouSituacao mouValidade
        }
      }
    }
  }
`;

export const MEMBROS_RESUMO_QUERY = `
  query MembrosResumo($after: String) {
    membros(first: 200, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges { node { id situacao clubeId } }
    }
  }
`;

export const PIPELINE_QUERY = `
  query Pipeline($after: String) {
    etapasJornada(first: 200, after: $after, filter: { escopo: { eq: "CLUBE" } }) {
      pageInfo { hasNextPage endCursor }
      edges { node { id clubeId ordem situacao } }
    }
  }
`;

// Os campos próprios do clube saem do metadata: escrever a lista à mão é como
// metade do cadastro ficava fora da tela — o campo existia no banco, não na
// consulta, e o editor não tinha o que mostrar. As relações seguem escritas,
// porque cada uma quer a própria sub-consulta.
export const montarClubeQuery = (objeto: ObjetoMeta): string => `
  query Clube($id: UUID!) {
    clube(filter: { id: { eq: $id } }) {
      ${selecaoDeCampos(objeto)}
      jornada { edges { node { ${ETAPA} } } }
      socios {
        edges { node {
          id name papel cpf cnpj rg nascimento profissao estadoCivil conjuge
          emails ${EMAIL} telefones ${FONE} telefoneFixo ${FONE}
          sexo nacionalidade naturalidade endereco ${ENDERECO}
          instagram ${LINK} linkedin ${LINK} site ${LINK}
        } }
      }
      membros {
        totalCount
        edges { node {
          id name situacao papel contratoSituacao fotoUrl
          emails ${EMAIL} telefones ${FONE} valorTotal ${MOEDA}
        } }
      }
      parcelas {
        edges { node { id name valor ${MOEDA} vencimento situacao pagaEm } }
      }
      timelineActivities {
        edges { node { id name happensAt createdAt properties } }
      }
    }
  }
`;

export const montarMembroQuery = (objeto: ObjetoMeta): string => `
  query Membro($id: UUID!) {
    membro(filter: { id: { eq: $id } }) {
      ${selecaoDeCampos(objeto)}
      clube { id name }
      jornada { edges { node { ${ETAPA} } } }
      parcelas {
        edges { node { id name valor ${MOEDA} vencimento situacao pagaEm formaPagamento } }
      }
      dependentes {
        edges { node { id name nascimento sexo parentesco } }
      }
      pendencias {
        edges { node { id name descricao situacao prazo resolvidaEm } }
      }
      timelineActivities {
        edges { node { id name happensAt createdAt properties } }
      }
    }
  }
`;

// O app só existe onde o workspace tem os objetos de clube. Sem essa checagem
// a primeira consulta estoura com o erro cru do GraphQL numa tela vazia.
export const OBJETOS_QUERY = `
  query Objetos {
    objects(paging: { first: 200 }) {
      edges { node { id nameSingular } }
    }
  }
`;

export const SAIR_MUTATION = `
  mutation Sair {
    signOut
  }
`;

export const CURRENT_USER_QUERY = `
  query CurrentUser {
    currentUser {
      id email firstName lastName
      currentWorkspace { id displayName }
    }
  }
`;

export const LOGIN_MUTATION = `
  mutation Entrar($email: String!, $password: String!) {
    getLoginTokenFromCredentials(email: $email, password: $password) {
      loginToken { token }
    }
  }
`;

export const EXCHANGE_MUTATION = `
  mutation Trocar($loginToken: String!) {
    getAuthTokensFromLoginToken(loginToken: $loginToken) {
      tokens { accessOrWorkspaceAgnosticToken { token } }
    }
  }
`;

export const ATUALIZAR_ETAPA = `
  mutation AtualizarEtapa($id: UUID!, $data: EtapaJornadaUpdateInput!) {
    updateEtapaJornada(id: $id, data: $data) { ${ETAPA} }
  }
`;

export const FINANCEIRO_QUERY = `
  query Financeiro($after: String) {
    parcelas(first: 200, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id name numero situacao vencimento pagaEm lembreteEm
          valor ${MOEDA}
          formaPagamento membroId clubeId
        }
      }
    }
  }
`;

export const CRIAR_VENDA = `
  mutation CriarVenda($data: VendaCreateInput!) {
    createVenda(data: $data) { id name }
  }
`;

export const CRIAR_PARCELAS = `
  mutation CriarParcelas($data: [ParcelaCreateInput!]!) {
    createParcelas(data: $data) { id }
  }
`;

export const ATUALIZAR_PARCELA = `
  mutation AtualizarParcela($id: UUID!, $data: ParcelaUpdateInput!) {
    updateParcela(id: $id, data: $data) { id situacao pagaEm }
  }
`;

export const ATUALIZAR_CLUBE_STATUS = `
  mutation AtualizarClubeStatus($id: UUID!, $situacao: ClubeSituacaoEnum) {
    updateClube(id: $id, data: { situacao: $situacao }) { id situacao }
  }
`;

export const CLUBES_SIMPLES_QUERY = `
  query ClubesSimples($after: String) {
    clubes(first: 60, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges { node { id name situacao } }
    }
  }
`;

export const MEMBROS_SIMPLES_QUERY = `
  query MembrosSimples($after: String) {
    membros(first: 200, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges { node { id name clubeId fotoUrl emails { primaryEmail } } }
    }
  }
`;

export const RADAR_QUERY = `
  query Radar($after: String) {
    membros(first: 200, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id name nascimento entradaEm papel situacao fotoUrl
          camiseta calca moletom calcado chocolateFavorito frutaFavorita
          placaEntregue clubeId
        }
      }
    }
  }
`;

export const RADAR_CLUBES_QUERY = `
  query RadarClubes($after: String) {
    clubes(first: 60, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges { node { id name inicio mouValidade situacao mentor } }
    }
  }
`;

export const ARQUIVAR_CLUBE = `
  mutation ArquivarClube($id: UUID!) {
    deleteClube(id: $id) { id deletedAt }
  }
`;

export const ARQUIVAR_MEMBRO = `
  mutation ArquivarMembro($id: UUID!) {
    deleteMembro(id: $id) { id deletedAt }
  }
`;

// O filtro citando deletedAt é o que desliga o corte de soft delete na API —
// não existe um argumento withDeleted no contrato.
export const CLUBES_ARQUIVADOS_QUERY = `
  query ClubesArquivados($after: String) {
    clubes(
      first: 200
      after: $after
      filter: { deletedAt: { is: NOT_NULL } }
      orderBy: [{ deletedAt: DescNullsLast }]
    ) {
      pageInfo { hasNextPage endCursor }
      edges { node { id name mentor situacao deletedAt } }
    }
  }
`;

export const MEMBROS_ARQUIVADOS_QUERY = `
  query MembrosArquivados($after: String) {
    membros(
      first: 200
      after: $after
      filter: { deletedAt: { is: NOT_NULL } }
      orderBy: [{ deletedAt: DescNullsLast }]
    ) {
      pageInfo { hasNextPage endCursor }
      edges { node { id name papel situacao clubeId fotoUrl deletedAt } }
    }
  }
`;

export const RESTAURAR_CLUBE = `
  mutation RestaurarClube($id: UUID!) {
    restoreClube(id: $id) { id deletedAt }
  }
`;

export const RESTAURAR_MEMBRO = `
  mutation RestaurarMembro($id: UUID!) {
    restoreMembro(id: $id) { id deletedAt }
  }
`;
