import {
  carregarClubes,
  carregarContratosDoGateway,
  carregarFaturasDoGateway,
  carregarMembros,
  carregarParcelas,
} from 'src/api/listas';
import { type CampoMeta, type ObjetoMeta, carregarMetadata } from 'src/api/metadata';
import { camposDoCadastro, selecaoDeCampos } from 'src/api/selecao';
import { type GrupoDeCampos } from './CadastroCompleto';
import { type Celula, type Coluna, dataBr, gerarCsv } from './csv';
import { hojeLocal } from './datas';
import { listarDevedores } from './devedores';
import { GRUPOS_DO_CLUBE, GRUPOS_DO_MEMBRO } from './gruposDeCampos';
import { paginar } from './paginar';

type Registro = Record<string, unknown>;

type Composto = Record<string, unknown> | null | undefined;

const campoDe = (registro: Registro, nome: string): Composto => registro[nome] as Composto;

const texto = (valor: unknown): Celula =>
  valor === null || valor === undefined || valor === '' ? null : String(valor);

const DATA_E_HORA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
  timeStyle: 'short',
});

// Um campo vira uma ou mais colunas no formato que a planilha entende: o
// rótulo da opção em vez do código, reais em vez de micros, o endereço aberto
// em colunas para dar para filtrar por cidade.
const colunasDoCampo = (campo: CampoMeta, rotulo: string): Coluna<Registro>[] => {
  const valor = (registro: Registro) => registro[campo.name];

  switch (campo.type) {
    case 'SELECT': {
      const rotuloDaOpcao = new Map((campo.options ?? []).map((opcao) => [opcao.value, opcao.label]));

      return [{ titulo: rotulo, valor: (registro) => texto(rotuloDaOpcao.get(String(valor(registro))) ?? valor(registro)) }];
    }
    case 'BOOLEAN':
      return [{ titulo: rotulo, valor: (registro) => (valor(registro) === true ? 'Sim' : valor(registro) === false ? 'Não' : null) }];
    case 'DATE':
      return [{ titulo: rotulo, valor: (registro) => dataBr(valor(registro) as string | null) }];
    case 'DATE_TIME':
      return [
        {
          titulo: rotulo,
          valor: (registro) => {
            const bruto = valor(registro);
            const quando = typeof bruto === 'string' ? new Date(bruto) : null;

            return quando === null || Number.isNaN(quando.getTime()) ? null : DATA_E_HORA.format(quando);
          },
        },
      ];
    case 'NUMBER':
    case 'NUMERIC':
      return [{ titulo: rotulo, valor: (registro) => (typeof valor(registro) === 'number' ? (valor(registro) as number) : null) }];
    case 'CURRENCY':
      return [
        {
          titulo: `${rotulo} (R$)`,
          valor: (registro) => {
            const micros = campoDe(registro, campo.name)?.amountMicros;

            return micros === null || micros === undefined ? null : Number(micros) / 1_000_000;
          },
        },
      ];
    case 'EMAILS':
      return [{ titulo: rotulo, valor: (registro) => texto(campoDe(registro, campo.name)?.primaryEmail) }];
    case 'PHONES':
      return [
        {
          titulo: rotulo,
          valor: (registro) => {
            const fone = campoDe(registro, campo.name);
            const numero = texto(fone?.primaryPhoneNumber);

            return numero === null ? null : `${fone?.primaryPhoneCallingCode ?? ''} ${numero}`.trim();
          },
        },
      ];
    case 'LINKS':
      return [{ titulo: rotulo, valor: (registro) => texto(campoDe(registro, campo.name)?.primaryLinkUrl) }];
    case 'ADDRESS':
      return (
        [
          ['addressStreet1', 'rua'],
          ['addressStreet2', 'complemento'],
          ['addressCity', 'cidade'],
          ['addressState', 'estado'],
          ['addressPostcode', 'CEP'],
          ['addressCountry', 'país'],
        ] as const
      ).map(([parte, nome]) => ({
        titulo: `${rotulo} – ${nome}`,
        valor: (registro: Registro) => texto(campoDe(registro, campo.name)?.[parte]),
      }));
    default:
      return [
        {
          titulo: rotulo,
          valor: (registro) => {
            const bruto = valor(registro);

            return typeof bruto === 'object' && bruto !== null ? JSON.stringify(bruto) : texto(bruto);
          },
        },
      ];
  }
};

// Todas as colunas do cadastro, na ordem da tela: nome, depois os grupos, e o
// que não está em grupo nenhum em ordem alfabética no fim. Sai do metadata,
// então um campo criado amanhã entra na exportação sem mexer aqui.
export const colunasDoCadastro = (objeto: ObjetoMeta, grupos: readonly GrupoDeCampos[]): Coluna<Registro>[] => {
  const campos = new Map(camposDoCadastro(objeto).map((campo) => [campo.name, campo]));
  const rotuloDaTela = new Map<string, string>();
  const ordem = ['name'];

  for (const grupo of grupos) {
    for (const campo of grupo.campos) {
      const nome = typeof campo === 'string' ? campo : campo.nome;

      if (typeof campo !== 'string') {
        rotuloDaTela.set(nome, campo.rotulo);
      }

      if (!ordem.includes(nome)) {
        ordem.push(nome);
      }
    }
  }

  const resto = [...campos.values()]
    .filter((campo) => !ordem.includes(campo.name))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
    .map((campo) => campo.name);

  return [...ordem, ...resto].flatMap((nome) => {
    const campo = campos.get(nome);

    return campo === undefined ? [] : colunasDoCampo(campo, rotuloDaTela.get(nome) ?? campo.label);
  });
};

const carregarRegistros = (objeto: ObjetoMeta, relacoes: readonly string[]) =>
  paginar<Registro>(
    `query Exportar($after: String) {
      ${objeto.namePlural}(first: 1000, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges { node { ${selecaoDeCampos(objeto)} ${relacoes.join(' ')} } }
      }
    }`,
    objeto.namePlural,
  );

const carregarBus = () =>
  paginar<{ id: string; name: string }>(
    `query BusDaExportacao($after: String) {
      businessUnits(first: 1000, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges { node { id name } }
      }
    }`,
    'businessUnits',
  ).catch(() => []);

// A situação financeira usa a mesma regra do painel de quem está em atraso,
// para a planilha e a tela nunca discordarem.
const carregarDevedores = async () => {
  const [membros, clubes, parcelas, contratos, faturas] = await Promise.all([
    carregarMembros(),
    carregarClubes(),
    carregarParcelas(),
    carregarContratosDoGateway(),
    carregarFaturasDoGateway(),
  ]);

  const devedores = listarDevedores({ hoje: hojeLocal(), membros, clubes, parcelas, contratos, faturas });

  return {
    membros,
    devedorPorChave: new Map(devedores.map((devedor) => [`${devedor.tipo}:${devedor.id}`, devedor])),
  };
};

export type Planilha = { arquivo: string; conteudo: string; linhas: number };

const relacoesDe = (objeto: ObjetoMeta, candidatas: readonly string[]) =>
  candidatas.filter((relacao) => objeto.campoPorNome.has(relacao)).map((relacao) => `${relacao}Id`);

export const exportarPlanilha = async (
  qual: 'clubes' | 'membros',
  aoAvancar: (etapa: string) => void,
): Promise<Planilha> => {
  aoAvancar('Lendo o cadastro…');

  const metadata = await carregarMetadata();
  const objeto = metadata.get(qual === 'clubes' ? 'clube' : 'membro');

  if (objeto === undefined) {
    throw new Error('Não encontramos o cadastro para exportar.');
  }

  const relacoes = relacoesDe(objeto, qual === 'clubes' ? ['businessUnit'] : ['clube', 'businessUnit']);
  const [registros, bus, financeiro, clubes] = await Promise.all([
    carregarRegistros(objeto, relacoes),
    carregarBus(),
    carregarDevedores(),
    carregarClubes(),
  ]);

  aoAvancar('Montando a planilha…');

  const nomeDaBu = new Map(bus.map((bu) => [bu.id, bu.name]));
  const nomeDoClube = new Map(clubes.map((clube) => [clube.id, clube.name]));
  const tipo = qual === 'clubes' ? 'clube' : 'membro';
  const devedor = (registro: Registro) => financeiro.devedorPorChave.get(`${tipo}:${String(registro.id)}`);
  const doCadastro = colunasDoCadastro(objeto, qual === 'clubes' ? GRUPOS_DO_CLUBE : GRUPOS_DO_MEMBRO);
  const [nome, ...restoDoCadastro] = doCadastro;

  const membrosPorClube = new Map<string, { total: number; ativos: number }>();

  for (const membro of financeiro.membros) {
    if (membro.clubeId !== null) {
      const conta = membrosPorClube.get(membro.clubeId) ?? { total: 0, ativos: 0 };

      conta.total += 1;
      conta.ativos += membro.situacao === 'ATIVO' ? 1 : 0;
      membrosPorClube.set(membro.clubeId, conta);
    }
  }

  const colunas: Coluna<Registro>[] = [
    ...(nome === undefined ? [] : [nome]),
    ...(qual === 'membros'
      ? [{ titulo: 'Clube', valor: (registro: Registro) => texto(nomeDoClube.get(String(registro.clubeId))) }]
      : []),
    ...restoDoCadastro,
    { titulo: 'BU', valor: (registro) => texto(nomeDaBu.get(String(registro.businessUnitId))) },
    ...(qual === 'clubes'
      ? [
          { titulo: 'Membros', valor: (registro: Registro) => membrosPorClube.get(String(registro.id))?.total ?? 0 },
          { titulo: 'Membros ativos', valor: (registro: Registro) => membrosPorClube.get(String(registro.id))?.ativos ?? 0 },
        ]
      : []),
    { titulo: 'Financeiro', valor: (registro) => (devedor(registro) === undefined ? 'Em dia' : 'Em atraso') },
    {
      titulo: 'Valor em atraso (R$)',
      valor: (registro) => {
        const valor = devedor(registro)?.valorEmAtraso ?? 0;

        return valor === 0 ? null : valor / 1_000_000;
      },
    },
    { titulo: 'ID', valor: (registro) => texto(registro.id) },
  ];

  const ordenados = [...registros].sort((a, b) =>
    String(a.name ?? '').localeCompare(String(b.name ?? ''), 'pt-BR'),
  );

  return {
    arquivo: `${qual}-${hojeLocal()}.csv`,
    conteudo: gerarCsv(colunas, ordenados),
    linhas: ordenados.length,
  };
};

export const baixarArquivo = ({ arquivo, conteudo }: Planilha) => {
  const endereco = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');

  link.href = endereco;
  link.download = arquivo;
  document.body.append(link);
  link.click();
  link.remove();
  // Depois do clique o navegador já tem o arquivo; soltar o endereço devolve a
  // memória da planilha inteira.
  setTimeout(() => URL.revokeObjectURL(endereco), 1000);
};
