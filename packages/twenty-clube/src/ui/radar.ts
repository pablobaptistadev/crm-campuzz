import { diasEntre } from './datas';
import { dataCurta } from './format';

export type TipoDoEvento =
  | 'aniversario'
  | 'aniversarioDeSocio'
  | 'aniversarioDeDependente'
  | 'tempoDeCasa'
  | 'marco'
  | 'mou'
  | 'prazo'
  | 'conclusao';

export type GrupoDoTipo = 'aniversarios' | 'jornada' | 'contrato' | 'marcos';

export const GRUPO_DO_TIPO: Record<TipoDoEvento, GrupoDoTipo> = {
  aniversario: 'aniversarios',
  aniversarioDeSocio: 'aniversarios',
  aniversarioDeDependente: 'aniversarios',
  tempoDeCasa: 'marcos',
  marco: 'marcos',
  mou: 'contrato',
  prazo: 'jornada',
  conclusao: 'jornada',
};

export const ROTULO_DO_TIPO: Record<TipoDoEvento, string> = {
  aniversario: 'Aniversário',
  aniversarioDeSocio: 'Aniversário de sócio',
  aniversarioDeDependente: 'Aniversário de dependente',
  tempoDeCasa: 'Tempo de casa',
  marco: 'Marco do clube',
  mou: 'MOU',
  prazo: 'Prazo da jornada',
  conclusao: 'Etapa concluída',
};

export type EventoDoRadar = {
  chave: string;
  tipo: TipoDoEvento;
  titulo: string;
  detalhe: string;
  // 'AAAA-MM-DD'
  quando: string;
  // Em relação a hoje: negativo já passou.
  dias: number;
  link: string;
  fotoUrl?: string | null;
  presente?: string;
  // Quem concluiu a etapa, para mostrar foto e nome.
  autorId?: string | null;
};

type MembroDoRadar = {
  id: string;
  name: string;
  clubeId: string | null;
  situacao: string | null;
  fotoUrl: string | null;
  nascimento: string | null;
  entradaEm: string | null;
  camiseta?: string | null;
  calca?: string | null;
  moletom?: string | null;
  calcado?: string | null;
  chocolateFavorito?: string | null;
  frutaFavorita?: string | null;
};

type ClubeDoRadar = {
  id: string;
  name: string;
  situacao: string | null;
  mentor: string | null;
  inicio: string | null;
  mouValidade: string | null;
};

type SocioDoRadar = { id: string; name: string; nascimento: string | null; clubeId: string | null };

type DependenteDoRadar = {
  id: string;
  name: string;
  nascimento: string | null;
  parentesco: string | null;
  membroId: string | null;
};

type EtapaDoRadar = {
  id: string;
  name: string;
  escopo: string | null;
  situacao: string | null;
  prazo: string | null;
  concluidaEm: string | null;
  responsavel: string | null;
  clubeId: string | null;
  membroId: string | null;
};

// Fora de operação não gera cobrança de prazo nem de MOU: um clube perdido com
// o MOU vencido não é algo que alguém vá resolver.
const FORA_DE_OPERACAO = new Set(['INATIVO', 'PERDIDO']);

export const JANELA_DO_PASSADO = 30;

const dataValida = (valor: string | null | undefined): valor is string =>
  typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valor);

const ultimoDiaDoMes = (ano: number, mes: number): number =>
  new Date(Date.UTC(ano, mes, 0)).getUTCDate();

const montarData = (ano: number, mes: number, dia: number): string =>
  `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(Math.min(dia, ultimoDiaDoMes(ano, mes))).padStart(2, '0')}`;

// A próxima vez que o dia e o mês caem, a partir de hoje (inclusive). Só dia e
// mês contam: 15 aniversários foram gravados com ano 0001 porque a equipe sabe
// o dia e não o ano. 29/02 cai em 28/02 nos anos que não são bissextos.
export const proximaOcorrencia = (data: string, hoje: string): string => {
  const [, mes, dia] = data.slice(0, 10).split('-').map(Number);
  const ano = Number(hoje.slice(0, 4));
  const desteAno = montarData(ano, mes, dia);

  return desteAno >= hoje.slice(0, 10) ? desteAno : montarData(ano + 1, mes, dia);
};

// Soma meses segurando o fim do mês: 31/08 + 6 meses é 28/02, não 03/03.
export const somarMeses = (data: string, meses: number): string => {
  const [ano, mes, dia] = data.slice(0, 10).split('-').map(Number);
  const total = mes - 1 + meses;

  return montarData(ano + Math.floor(total / 12), (total % 12) + 1, dia);
};

// Ano 0001 (ou qualquer um antes de 1900) quer dizer "não sabemos o ano".
const nascimentoLegivel = (data: string): string =>
  Number(data.slice(0, 4)) < 1900 ? dataCurta(data).slice(0, 5) : dataCurta(data);

const MARCOS = [
  { meses: 6, rotulo: '6 meses' },
  { meses: 12, rotulo: '1 ano' },
  { meses: 24, rotulo: '2 anos' },
];

export const montarRadar = ({
  hoje,
  membros,
  clubes,
  socios,
  dependentes,
  etapas,
  autorDaConclusao,
}: {
  hoje: string;
  membros: readonly MembroDoRadar[];
  clubes: readonly ClubeDoRadar[];
  socios: readonly SocioDoRadar[];
  dependentes: readonly DependenteDoRadar[];
  etapas: readonly EtapaDoRadar[];
  // etapaId → quem marcou como concluída, lido do histórico.
  autorDaConclusao: ReadonlyMap<string, string | null>;
}): EventoDoRadar[] => {
  const saida: EventoDoRadar[] = [];
  const clubePorId = new Map(clubes.map((clube) => [clube.id, clube]));
  const membroPorId = new Map(membros.map((membro) => [membro.id, membro]));
  const nomeDoClube = (clubeId: string | null) =>
    (clubeId === null ? undefined : clubePorId.get(clubeId))?.name ?? 'Sem clube';
  const evento = (dados: Omit<EventoDoRadar, 'dias'>): EventoDoRadar => ({
    ...dados,
    dias: diasEntre(hoje, dados.quando),
  });

  for (const membro of membros) {
    if (dataValida(membro.nascimento)) {
      const presente = [
        membro.camiseta ? `camiseta ${membro.camiseta}` : null,
        membro.moletom ? `moletom ${membro.moletom}` : null,
        membro.calca ? `calça ${membro.calca}` : null,
        membro.calcado ? `calçado ${membro.calcado}` : null,
        membro.chocolateFavorito,
        membro.frutaFavorita,
      ]
        .filter((parte): parte is string => typeof parte === 'string' && parte !== '')
        .join(' · ');

      saida.push(
        evento({
          chave: `nasc-${membro.id}`,
          tipo: 'aniversario',
          titulo: membro.name,
          detalhe: `${nomeDoClube(membro.clubeId)} · nasceu em ${nascimentoLegivel(membro.nascimento)}`,
          quando: proximaOcorrencia(membro.nascimento, hoje),
          link: `/membros/${membro.id}`,
          fotoUrl: membro.fotoUrl,
          presente: presente === '' ? undefined : presente,
        }),
      );
    }

    if (dataValida(membro.entradaEm) && !FORA_DE_OPERACAO.has(membro.situacao ?? '')) {
      const quando = proximaOcorrencia(membro.entradaEm, hoje);
      const anos = Number(quando.slice(0, 4)) - Number(membro.entradaEm.slice(0, 4));

      if (anos > 0) {
        saida.push(
          evento({
            chave: `casa-${membro.id}`,
            tipo: 'tempoDeCasa',
            titulo: membro.name,
            detalhe: `${nomeDoClube(membro.clubeId)} · ${anos} ${anos === 1 ? 'ano' : 'anos'} de casa`,
            quando,
            link: `/membros/${membro.id}`,
            fotoUrl: membro.fotoUrl,
          }),
        );
      }
    }
  }

  for (const socio of socios) {
    if (dataValida(socio.nascimento) && socio.clubeId !== null && clubePorId.has(socio.clubeId)) {
      saida.push(
        evento({
          chave: `socio-${socio.id}`,
          tipo: 'aniversarioDeSocio',
          titulo: socio.name,
          detalhe: `Sócio de ${nomeDoClube(socio.clubeId)} · nasceu em ${nascimentoLegivel(socio.nascimento)}`,
          quando: proximaOcorrencia(socio.nascimento, hoje),
          link: `/clubes/${socio.clubeId}`,
        }),
      );
    }
  }

  for (const dependente of dependentes) {
    const membro = dependente.membroId === null ? undefined : membroPorId.get(dependente.membroId);

    if (dataValida(dependente.nascimento) && membro !== undefined) {
      const parentesco = dependente.parentesco?.trim() || 'Dependente';

      saida.push(
        evento({
          chave: `dep-${dependente.id}`,
          tipo: 'aniversarioDeDependente',
          titulo: dependente.name,
          detalhe: `${parentesco} de ${membro.name} · nasceu em ${nascimentoLegivel(dependente.nascimento)}`,
          quando: proximaOcorrencia(dependente.nascimento, hoje),
          link: `/membros/${membro.id}`,
        }),
      );
    }
  }

  for (const clube of clubes) {
    if (FORA_DE_OPERACAO.has(clube.situacao ?? '')) {
      continue;
    }

    if (dataValida(clube.inicio)) {
      for (const marco of MARCOS) {
        saida.push(
          evento({
            chave: `marco-${clube.id}-${marco.meses}`,
            tipo: 'marco',
            titulo: clube.name,
            detalhe: `${marco.rotulo} de clube · ${clube.mentor ?? 'sem mentor'}`,
            quando: somarMeses(clube.inicio, marco.meses),
            link: `/clubes/${clube.id}`,
          }),
        );
      }
    }

    if (dataValida(clube.mouValidade)) {
      saida.push(
        evento({
          chave: `mou-${clube.id}`,
          tipo: 'mou',
          titulo: clube.name,
          detalhe: `MOU válido até ${dataCurta(clube.mouValidade)}`,
          quando: clube.mouValidade.slice(0, 10),
          link: `/clubes/${clube.id}`,
        }),
      );
    }
  }

  for (const etapa of etapas) {
    // Etapa sem dono veio de importação e não pertence a ninguém; não há o que
    // abrir nem de quem cobrar.
    const doMembro = etapa.escopo === 'MEMBRO';
    const membro = doMembro && etapa.membroId !== null ? membroPorId.get(etapa.membroId) : undefined;
    const clube = !doMembro && etapa.clubeId !== null ? clubePorId.get(etapa.clubeId) : undefined;
    const dono = membro ?? clube;

    if (dono === undefined) {
      continue;
    }

    const titulo = dono.name;
    const onde = membro === undefined ? 'Jornada do clube' : `Jornada do membro · ${nomeDoClube(membro.clubeId)}`;
    const link = membro === undefined ? `/clubes/${dono.id}` : `/membros/${dono.id}`;
    const concluida = etapa.situacao === 'CONCLUIDA';

    if (concluida && dataValida(etapa.concluidaEm)) {
      saida.push(
        evento({
          chave: `conc-${etapa.id}`,
          tipo: 'conclusao',
          titulo,
          detalhe: `${etapa.name} · ${onde}`,
          quando: etapa.concluidaEm.slice(0, 10),
          link,
          fotoUrl: membro?.fotoUrl,
          autorId: autorDaConclusao.get(etapa.id) ?? null,
        }),
      );
    }

    if (!concluida && dataValida(etapa.prazo) && !FORA_DE_OPERACAO.has(dono.situacao ?? '')) {
      saida.push(
        evento({
          chave: `prazo-${etapa.id}`,
          tipo: 'prazo',
          titulo,
          detalhe: `${etapa.name} · ${onde}${etapa.responsavel ? ` · responsável: ${etapa.responsavel}` : ''}`,
          quando: etapa.prazo.slice(0, 10),
          link,
          fotoUrl: membro?.fotoUrl,
        }),
      );
    }
  }

  return saida;
};

export type FaixaDoRadar = 'vencidos' | 'hoje' | 'proximos' | 'concluidas';

// Em que faixa o evento aparece, ou nenhuma. Aniversário e tempo de casa se
// repetem, então nunca ficam no passado; prazo e MOU ficam em "vencidos" até
// alguém resolver; marco que passou fica o mês seguinte, para ser celebrado.
export const faixaDoEvento = (
  evento: EventoDoRadar,
  limiteDosProximos: number,
): FaixaDoRadar | null => {
  if (evento.tipo === 'conclusao') {
    return evento.dias <= 0 && evento.dias >= -JANELA_DO_PASSADO ? 'concluidas' : null;
  }

  if (evento.dias === 0) {
    return 'hoje';
  }

  if (evento.dias > 0) {
    return evento.dias <= limiteDosProximos ? 'proximos' : null;
  }

  if (evento.tipo === 'prazo' || evento.tipo === 'mou') {
    return 'vencidos';
  }

  if (evento.tipo === 'marco') {
    return evento.dias >= -JANELA_DO_PASSADO ? 'vencidos' : null;
  }

  return null;
};

// O histórico diz quem concluiu: o último `updated` da etapa que levou a
// situação para CONCLUIDA.
export const autoresDasConclusoes = (
  eventos: readonly {
    targetEtapaJornadaId: string | null;
    happensAt: string | null;
    workspaceMemberId: string | null;
    properties: { diff?: Record<string, { after?: unknown }> } | null;
  }[],
): Map<string, string | null> => {
  const ultimo = new Map<string, { quando: string; autor: string | null }>();

  for (const item of eventos) {
    const etapaId = item.targetEtapaJornadaId;

    if (etapaId === null || item.properties?.diff?.situacao?.after !== 'CONCLUIDA') {
      continue;
    }

    const quando = item.happensAt ?? '';
    const atual = ultimo.get(etapaId);

    if (atual === undefined || quando > atual.quando) {
      ultimo.set(etapaId, { quando, autor: item.workspaceMemberId });
    }
  }

  return new Map([...ultimo].map(([etapaId, { autor }]) => [etapaId, autor]));
};

