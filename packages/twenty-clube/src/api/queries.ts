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

// Toda linha do histórico sai com quem a fez. Pedir o autor aqui, e não em
// cada tela, é o que garante que um histórico novo já nasça mostrando foto e
// nome — o esquecido seria justamente o próximo. Só o id: a foto e o nome vêm
// de src/ui/autores, uma vez por página, porque a relação pedida aqui custava
// uma ida ao banco por linha.
export const LINHA_DO_TEMPO = `
  id name happensAt createdAt properties workspaceMemberId
`;

export const HISTORICO_DO_ALVO_QUERY = `
  query HistoricoDoAlvo($filtro: TimelineActivityFilterInput, $after: String) {
    timelineActivities(first: 1000, after: $after, filter: $filtro) {
      pageInfo { hasNextPage endCursor }
      edges { node { ${LINHA_DO_TEMPO} } }
    }
  }
`;

// O painel usa três consultas achatadas em vez de uma aninhada: uma relação
// to-many dentro de 38 clubes vira 76 idas ao banco e a tela fica em branco.
export const CLUBES_QUERY = `
  query Clubes($after: String) {
    clubes(first: 60, after: $after) {
      totalCount
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id name mentor situacao inicio responsavel modeloFinanceiro fotoUrl
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
      edges { node {
        id situacao clubeId name fotoUrl emailFinanceiro
        emails { primaryEmail }
      } }
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
      businessUnit { id name }
      contratos {
        edges { node { id faturas { edges { node { invoiceStatus dueAt paidAt } } } } }
      }
      jornada { edges { node { ${ETAPA} } } }
      socios {
        edges { node {
          id name papel cpf cnpj rg nascimento profissao estadoCivil conjuge
          emails ${EMAIL} telefones ${FONE} telefoneFixo ${FONE}
          sexo nacionalidade naturalidade endereco ${ENDERECO}
          instagram ${LINK} linkedin ${LINK} site ${LINK}
        } }
      }
      parcelas {
        edges { node { id name valor ${MOEDA} vencimento situacao pagaEm } }
      }
    }
  }
`;

// Os membros do clube saem daqui, e nao de `clube { membros }`: a relacao
// aninhada nao aceita `first:` e devolve uma pagina fixa de 60. Num clube de 78
// a aba mostrava 78 e a lista 60, e os 18 que faltavam nao apareciam em busca
// nem em filtro — o pior tipo de ausencia, a que ninguem ve.
//
// Sem parcelas nem contratos aninhados: o edge resolve relacao linha a linha,
// e cada uma custava uma ida ao banco por membro. Medido em producao: 1,3 s so
// com os membros, 24 s com parcelas e contratos juntos. O financeiro vem nas
// listas achatadas abaixo, que custam o mesmo com 10 ou 1.000 membros.
export const MEMBROS_DO_CLUBE_QUERY = `
  query MembrosDoClube($id: UUID!, $after: String) {
    membros(first: 200, after: $after, filter: { clubeId: { eq: $id } }) {
      totalCount
      pageInfo { hasNextPage endCursor }
      edges { node {
        id name situacao papel contratoSituacao fotoUrl
        emails ${EMAIL} emailFinanceiro telefones ${FONE} valorTotal ${MOEDA}
        inadimplenciaMarcada inadimplenciaVencimento
      } }
    }
  }
`;

export const PARCELAS_DOS_MEMBROS_QUERY = `
  query ParcelasDosMembros($ids: [UUID!], $after: String) {
    parcelas(first: 200, after: $after, filter: { membroId: { in: $ids } }) {
      pageInfo { hasNextPage endCursor }
      edges { node { membroId situacao vencimento pagaEm } }
    }
  }
`;

export const CONTRATOS_DOS_MEMBROS_QUERY = `
  query ContratosDosMembros($ids: [UUID!], $after: String) {
    gatewayContracts(first: 200, after: $after, filter: { membroId: { in: $ids } }) {
      pageInfo { hasNextPage endCursor }
      edges { node { id membroId } }
    }
  }
`;

export const FATURAS_DOS_CONTRATOS_QUERY = `
  query FaturasDosContratos($ids: [UUID!], $after: String) {
    gatewayInvoices(first: 200, after: $after, filter: { contratoId: { in: $ids } }) {
      pageInfo { hasNextPage endCursor }
      edges { node { contratoId invoiceStatus dueAt paidAt } }
    }
  }
`;

export const montarMembroQuery = (objeto: ObjetoMeta): string => `
  query Membro($id: UUID!) {
    membro(filter: { id: { eq: $id } }) {
      ${selecaoDeCampos(objeto)}
      clube { id name }
      businessUnit { id name }
      contratos {
        edges { node { id faturas { edges { node { invoiceStatus dueAt paidAt } } } } }
      }
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
      workspaceMember { id avatarUrl }
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

export const ARQUIVAR_SOCIO = `
  mutation ArquivarSocio($id: UUID!) {
    deleteSocio(id: $id) { id deletedAt }
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
