import { casaComABusca } from './busca';
import { diasEntre } from './datas';

export type OrigemDaPendencia = 'jornadaDoClube' | 'jornadaDoMembro' | 'manual';

export const ROTULO_DA_ORIGEM: Record<OrigemDaPendencia, string> = {
  jornadaDoClube: 'Jornada do clube',
  jornadaDoMembro: 'Jornada do membro',
  manual: 'Pendência manual',
};

type EtapaDoPainel = {
  id: string;
  name: string;
  escopo: string | null;
  ordem: number | null;
  situacao: string | null;
  prazo: string | null;
  responsavel: string | null;
  opcional: boolean | null;
  clubeId: string | null;
  membroId: string | null;
};

type PendenciaManual = {
  id: string;
  name: string;
  descricao: string | null;
  situacao: string | null;
  prazo: string | null;
  membroId: string | null;
};

type MembroDoPainel = {
  id: string;
  name: string;
  clubeId: string | null;
  situacao: string | null;
  fotoUrl: string | null;
  emails: { primaryEmail: string | null } | null;
  emailFinanceiro: string | null;
};

type ClubeDoPainel = { id: string; name: string; situacao: string | null; fotoUrl: string | null };

export type LinhaDePendencia = {
  chave: string;
  origem: OrigemDaPendencia;
  oQue: string;
  dono: { tipo: 'clube' | 'membro'; id: string; nome: string; fotoUrl: string | null };
  clube: { id: string; nome: string } | null;
  prazo: string | null;
  // Em relação a hoje: positivo já venceu, negativo ainda falta.
  diasDeAtraso: number | null;
  responsavel: string | null;
  opcional: boolean;
  situacao: string | null;
  // O dono (ou o clube do membro) está fora de operação.
  inativo: boolean;
  ordem: number;
  buscavel: (string | null | undefined)[];
  link: string;
};

// A jornada vai de 1 a 18; de 101 em diante é o pipeline de venda do clube,
// que não é pendência de ninguém.
const ULTIMA_ORDEM_DA_JORNADA = 100;

const FORA_DE_OPERACAO = new Set(['INATIVO', 'PERDIDO']);

// Todas as pendências possíveis, opcionais e de inativos inclusive: quem
// decide o que aparece é o filtro, para a contagem de "incluir opcionais"
// sair da mesma lista.
export const montarPendencias = ({
  hoje,
  etapas,
  manuais,
  membros,
  clubes,
}: {
  hoje: string;
  etapas: readonly EtapaDoPainel[];
  manuais: readonly PendenciaManual[];
  membros: readonly MembroDoPainel[];
  clubes: readonly ClubeDoPainel[];
}): LinhaDePendencia[] => {
  const membroPorId = new Map(membros.map((membro) => [membro.id, membro]));
  const clubePorId = new Map(clubes.map((clube) => [clube.id, clube]));
  const linhas: LinhaDePendencia[] = [];

  const atrasoDe = (prazo: string | null) =>
    prazo === null || prazo === '' ? null : diasEntre(prazo, hoje);

  const doMembro = (membro: MembroDoPainel) => {
    const clube = membro.clubeId === null ? undefined : clubePorId.get(membro.clubeId);

    return {
      dono: { tipo: 'membro' as const, id: membro.id, nome: membro.name, fotoUrl: membro.fotoUrl },
      clube: clube === undefined ? null : { id: clube.id, nome: clube.name },
      inativo:
        FORA_DE_OPERACAO.has(membro.situacao ?? '') || FORA_DE_OPERACAO.has(clube?.situacao ?? ''),
      buscavel: [membro.name, membro.emails?.primaryEmail, membro.emailFinanceiro, clube?.name],
      link: `/membros/${membro.id}`,
    };
  };

  for (const etapa of etapas) {
    if (etapa.situacao === 'CONCLUIDA' || (etapa.ordem ?? 0) > ULTIMA_ORDEM_DA_JORNADA) {
      continue;
    }

    const base = {
      oQue: etapa.name,
      prazo: etapa.prazo?.slice(0, 10) ?? null,
      diasDeAtraso: atrasoDe(etapa.prazo),
      responsavel: etapa.responsavel?.trim() || null,
      opcional: etapa.opcional === true,
      situacao: etapa.situacao,
      ordem: etapa.ordem ?? 0,
    };

    if (etapa.escopo === 'MEMBRO') {
      const membro = etapa.membroId === null ? undefined : membroPorId.get(etapa.membroId);

      // Sem dono é etapa órfã de importação, ou de membro arquivado: não há de
      // quem cobrar nem o que abrir.
      if (membro !== undefined) {
        const quem = doMembro(membro);

        linhas.push({
          chave: `etapa-${etapa.id}`,
          origem: 'jornadaDoMembro',
          ...base,
          ...quem,
          buscavel: [...quem.buscavel, etapa.name],
        });
      }

      continue;
    }

    const clube = etapa.clubeId === null ? undefined : clubePorId.get(etapa.clubeId);

    if (clube !== undefined) {
      linhas.push({
        chave: `etapa-${etapa.id}`,
        origem: 'jornadaDoClube',
        ...base,
        dono: { tipo: 'clube', id: clube.id, nome: clube.name, fotoUrl: clube.fotoUrl },
        clube: { id: clube.id, nome: clube.name },
        inativo: FORA_DE_OPERACAO.has(clube.situacao ?? ''),
        buscavel: [clube.name, etapa.name],
        link: `/clubes/${clube.id}`,
      });
    }
  }

  for (const manual of manuais) {
    const membro = manual.membroId === null ? undefined : membroPorId.get(manual.membroId);

    if (manual.situacao === 'RESOLVIDA' || membro === undefined) {
      continue;
    }

    const quem = doMembro(membro);
    const oQue = manual.descricao?.trim() || manual.name;

    linhas.push({
      chave: `manual-${manual.id}`,
      origem: 'manual',
      oQue,
      prazo: manual.prazo?.slice(0, 10) ?? null,
      diasDeAtraso: atrasoDe(manual.prazo),
      responsavel: null,
      // A pendência escrita à mão sempre conta: foi alguém que decidiu cobrá-la.
      opcional: false,
      situacao: manual.situacao,
      ordem: 0,
      ...quem,
      buscavel: [...quem.buscavel, oQue],
    });
  }

  return linhas;
};

export type FiltroDePrazo = '' | 'vencidas' | 'semana' | 'semPrazo';

export type FiltroDePendencia = {
  busca: string;
  origem: '' | OrigemDaPendencia;
  clubeId: string;
  etapa: string;
  prazo: FiltroDePrazo;
  responsavel: string;
  opcionais: boolean;
  inativos: boolean;
};

export const FILTRO_DE_PENDENCIA_VAZIO: FiltroDePendencia = {
  busca: '',
  origem: '',
  clubeId: '',
  etapa: '',
  prazo: '',
  responsavel: '',
  opcionais: false,
  inativos: false,
};

const ORIGENS: readonly OrigemDaPendencia[] = ['jornadaDoClube', 'jornadaDoMembro', 'manual'];
const PRAZOS: readonly FiltroDePrazo[] = ['vencidas', 'semana', 'semPrazo'];

// O filtro mora no endereço: uma visão filtrada vira link que dá para mandar
// para a colega, e voltar do membro para o painel não perde o filtro.
export const filtroDaUrl = (parametros: URLSearchParams): FiltroDePendencia => {
  const origem = parametros.get('origem') ?? '';
  const prazo = parametros.get('prazo') ?? '';

  return {
    busca: parametros.get('q') ?? '',
    origem: ORIGENS.includes(origem as OrigemDaPendencia) ? (origem as OrigemDaPendencia) : '',
    clubeId: parametros.get('clube') ?? '',
    etapa: parametros.get('etapa') ?? '',
    prazo: PRAZOS.includes(prazo as FiltroDePrazo) ? (prazo as FiltroDePrazo) : '',
    responsavel: parametros.get('responsavel') ?? '',
    opcionais: parametros.get('opcionais') === '1',
    inativos: parametros.get('inativos') === '1',
  };
};

export const filtroParaUrl = (filtro: FiltroDePendencia): Record<string, string> => {
  const saida: Record<string, string> = {};

  if (filtro.busca.trim() !== '') saida.q = filtro.busca;
  if (filtro.origem !== '') saida.origem = filtro.origem;
  if (filtro.clubeId !== '') saida.clube = filtro.clubeId;
  if (filtro.etapa !== '') saida.etapa = filtro.etapa;
  if (filtro.prazo !== '') saida.prazo = filtro.prazo;
  if (filtro.responsavel !== '') saida.responsavel = filtro.responsavel;
  if (filtro.opcionais) saida.opcionais = '1';
  if (filtro.inativos) saida.inativos = '1';

  return saida;
};

const normalizar = (texto: string | null) => (texto ?? '').trim().toLocaleLowerCase('pt-BR');

// Vencidas primeiro, da mais antiga para a mais nova; depois as que têm prazo,
// pela data; por último as sem prazo, agrupadas por clube e pela ordem da
// jornada — é assim que alguém percorre a lista resolvendo.
const comparar = (a: LinhaDePendencia, b: LinhaDePendencia): number => {
  const vencidaA = (a.diasDeAtraso ?? -Infinity) > 0;
  const vencidaB = (b.diasDeAtraso ?? -Infinity) > 0;

  if (vencidaA !== vencidaB) {
    return vencidaA ? -1 : 1;
  }

  if (vencidaA && vencidaB) {
    return (b.diasDeAtraso ?? 0) - (a.diasDeAtraso ?? 0);
  }

  if ((a.prazo === null) !== (b.prazo === null)) {
    return a.prazo === null ? 1 : -1;
  }

  if (a.prazo !== null && b.prazo !== null && a.prazo !== b.prazo) {
    return a.prazo < b.prazo ? -1 : 1;
  }

  return (
    (a.clube?.nome ?? '').localeCompare(b.clube?.nome ?? '', 'pt-BR') ||
    a.dono.nome.localeCompare(b.dono.nome, 'pt-BR') ||
    a.ordem - b.ordem
  );
};

export const filtrarPendencias = (
  linhas: readonly LinhaDePendencia[],
  filtro: FiltroDePendencia,
): LinhaDePendencia[] =>
  linhas
    .filter((linha) => {
      if (linha.opcional && !filtro.opcionais) return false;
      if (linha.inativo && !filtro.inativos) return false;
      if (filtro.origem !== '' && linha.origem !== filtro.origem) return false;
      if (filtro.clubeId !== '' && linha.clube?.id !== filtro.clubeId) return false;
      if (filtro.etapa !== '' && (linha.origem === 'manual' || linha.oQue !== filtro.etapa)) return false;
      if (filtro.responsavel !== '' && normalizar(linha.responsavel) !== normalizar(filtro.responsavel)) {
        return false;
      }

      switch (filtro.prazo) {
        case 'vencidas':
          if ((linha.diasDeAtraso ?? 0) <= 0) return false;
          break;
        case 'semana':
          if (linha.diasDeAtraso === null || linha.diasDeAtraso > 0 || linha.diasDeAtraso < -7) return false;
          break;
        case 'semPrazo':
          if (linha.prazo !== null) return false;
          break;
      }

      return casaComABusca(filtro.busca, linha.buscavel);
    })
    .sort(comparar);

export type ResumoDasPendencias = {
  total: number;
  vencidas: number;
  porOrigem: Record<OrigemDaPendencia, number>;
};

export const resumirPendencias = (linhas: readonly LinhaDePendencia[]): ResumoDasPendencias => ({
  total: linhas.length,
  vencidas: linhas.filter((linha) => (linha.diasDeAtraso ?? 0) > 0).length,
  porOrigem: {
    jornadaDoClube: linhas.filter((linha) => linha.origem === 'jornadaDoClube').length,
    jornadaDoMembro: linhas.filter((linha) => linha.origem === 'jornadaDoMembro').length,
    manual: linhas.filter((linha) => linha.origem === 'manual').length,
  },
});
