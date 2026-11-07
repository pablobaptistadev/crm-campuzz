import { type GrupoDeCampos } from './CadastroCompleto';

// A ordem em que o cadastro aparece na tela é também a ordem das colunas na
// exportação: quem abre a planilha encontra os campos onde já está acostumado.

// Ordem do que já conhecemos; o resto entra em "Outros campos" e continua
// editável, então um campo novo não depende de alguém lembrar desta lista.
export const GRUPOS_DO_MEMBRO: GrupoDeCampos[] = [
  {
    titulo: 'Documentos',
    campos: ['rg', 'cnpj', 'nascimento', 'sexo', 'estadoCivil', 'nacionalidade', 'naturalidade', 'profissao', 'conjuge'],
  },
  {
    // O financeiro mora junto do contato, não do contrato: é um jeito de falar
    // com a pessoa, e é onde quem atualiza cadastro vai procurar.
    titulo: 'Contato',
    campos: ['emailFinanceiro', 'telefones', 'telefoneFixo', 'endereco', 'instagram', 'linkedin', 'site'],
  },
  {
    titulo: 'No clube',
    campos: ['nomeCracha', 'papel', 'situacao', 'entradaEm'],
  },
  {
    titulo: 'Contrato',
    campos: ['contratoNumero', 'contratoSituacao', 'contratoAssinadoEm', 'contratoLink', 'valorTotal', 'modeloPagamento', 'linkFastpay'],
  },
  {
    titulo: 'Presentes e preferências',
    campos: ['camiseta', 'calca', 'moletom', 'calcado', 'chocolateFavorito', 'frutaFavorita', 'placaEntregue', 'placaEntregueEm'],
  },
  {
    titulo: 'Contato de emergência',
    campos: ['contatoEmergenciaNome', 'contatoEmergenciaTelefone'],
  },
  { titulo: 'Anotações', campos: ['maiorObjetivo', 'observacoes'] },
];

// Ordem, não filtro: o que não estiver aqui cai em "Outros campos" e continua
// editável. É o que garante que um campo criado amanhã apareça sozinho.
export const GRUPOS_DO_CLUBE: GrupoDeCampos[] = [
  {
    titulo: 'Identificação',
    campos: [
      { nome: 'name', rotulo: 'Nome do clube' },
      'nomeCracha',
      'mentor',
      'responsavel',
      'nicho',
      'situacao',
      'inicio',
      'miniBio',
    ],
  },
  {
    titulo: 'Financeiro',
    campos: [
      { nome: 'capitalNegociado', rotulo: 'Valor total' },
      { nome: 'modeloFinanceiro', rotulo: 'Modelo de pagamento' },
      'linkFastpay',
      'linkCheckout',
    ],
  },
  {
    titulo: 'Contrato e MOU',
    campos: [
      'mouSituacao',
      'mouAssinadoEm',
      'mouValidade',
      'mouLink',
      'origemContrato',
      'contratoMlsAssinado',
      'contratoMlsEm',
      'mlsId',
      'contratoScpAssinado',
      'contratoScpEm',
    ],
  },
  {
    titulo: 'Operação',
    campos: ['kickoffFeito', 'kickoffEm', 'lms', 'bu', 'mlsHouse', 'fastval', 'scpCriada', 'scpCriadaEm', 'grupoWhatsapp'],
  },
  {
    titulo: 'Presentes e preferências',
    campos: ['camiseta', 'calca', 'moletom', 'calcado', 'chocolateFavorito', 'frutaFavorita', 'placaEntregue', 'placaEntregueEm'],
  },
  {
    titulo: 'Contato de emergência',
    campos: ['contatoEmergenciaNome', 'contatoEmergenciaTelefone'],
  },
  { titulo: 'Anotações', campos: ['maiorObjetivo', 'observacoes'] },
];
