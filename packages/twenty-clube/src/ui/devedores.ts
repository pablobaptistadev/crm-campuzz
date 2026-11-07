import { type Origem, ORIGENS, estaAtrasada } from './atraso';
import { diasEntre } from './datas';

type Moeda = { amountMicros: number | null; currencyCode: string | null } | null;

type MembroDevedor = {
  id: string;
  name: string;
  clubeId: string | null;
  situacao: string | null;
  fotoUrl: string | null;
  inadimplenciaMarcada: boolean | null;
  inadimplenciaValor: Moeda;
  inadimplenciaVencimento: string | null;
};

type ClubeDevedor = {
  id: string;
  name: string;
  situacao: string | null;
  fotoUrl: string | null;
};

type ParcelaDevida = {
  membroId: string | null;
  clubeId: string | null;
  situacao: string | null;
  vencimento: string | null;
  pagaEm: string | null;
  valor: Moeda;
};

type ContratoDevido = { id: string; membroId: string | null; clubeId: string | null };

type FaturaDevida = {
  contratoId: string | null;
  invoiceStatus: string | null;
  dueAt: string | null;
  paidAt: string | null;
  amount: Moeda;
};

export type Devedor = {
  tipo: 'membro' | 'clube';
  id: string;
  nome: string;
  fotoUrl: string | null;
  situacao: string | null;
  clube: { id: string; nome: string } | null;
  origens: Origem[];
  vencidasPorOrigem: Record<Origem, number>;
  // Em micros, somando as três origens. A marcação é para a dívida que não
  // está nas outras duas, então somar não conta a mesma dívida duas vezes.
  valorEmAtraso: number;
  vencidoDesde: string | null;
  diasDeAtraso: number | null;
};

type Dono = { tipo: 'membro' | 'clube'; id: string } | null;

// A parcela de um membro também costuma levar o clube; é do membro que se
// cobra. Só a parcela sem membro é dívida do clube.
const donoDe = (membroId: string | null, clubeId: string | null): Dono =>
  membroId !== null ? { tipo: 'membro', id: membroId } : clubeId !== null ? { tipo: 'clube', id: clubeId } : null;

// Uma linha por pessoa, não por parcela: o cliente perguntava quem está em
// atraso, e a lista de parcelas respondia outra coisa — além de não ler o
// gateway nem a marcação da equipe.
export const listarDevedores = ({
  hoje,
  membros,
  clubes,
  parcelas,
  contratos,
  faturas,
}: {
  hoje: string;
  membros: readonly MembroDevedor[];
  clubes: readonly ClubeDevedor[];
  parcelas: readonly ParcelaDevida[];
  contratos: readonly ContratoDevido[];
  faturas: readonly FaturaDevida[];
}): Devedor[] => {
  const membroPorId = new Map(membros.map((membro) => [membro.id, membro]));
  const clubePorId = new Map(clubes.map((clube) => [clube.id, clube]));
  const contratoPorId = new Map(contratos.map((contrato) => [contrato.id, contrato]));
  const porDono = new Map<string, Devedor>();

  const somar = (dono: Dono, origem: Origem, valor: Moeda, vence: string | null) => {
    if (dono === null) {
      return;
    }

    // Quem não está na lista foi arquivado: a dívida some junto com o registro,
    // como no resto do app, em vez de aparecer sem nome nem link.
    const registro = dono.tipo === 'membro' ? membroPorId.get(dono.id) : clubePorId.get(dono.id);

    if (registro === undefined) {
      return;
    }

    const chave = `${dono.tipo}:${dono.id}`;
    let devedor = porDono.get(chave);

    if (devedor === undefined) {
      const clubeId = dono.tipo === 'membro' ? (registro as MembroDevedor).clubeId : null;
      const clube = clubeId === null ? undefined : clubePorId.get(clubeId);

      devedor = {
        tipo: dono.tipo,
        id: registro.id,
        nome: registro.name,
        fotoUrl: registro.fotoUrl,
        situacao: registro.situacao,
        clube: clube === undefined ? null : { id: clube.id, nome: clube.name },
        origens: [],
        vencidasPorOrigem: { manual: 0, automatico: 0, marcacao: 0 },
        valorEmAtraso: 0,
        vencidoDesde: null,
        diasDeAtraso: null,
      };
      porDono.set(chave, devedor);
    }

    devedor.vencidasPorOrigem[origem] += 1;
    devedor.valorEmAtraso += Number(valor?.amountMicros ?? 0);

    const dia = vence === null || vence === '' ? null : vence.slice(0, 10);

    if (dia !== null && (devedor.vencidoDesde === null || dia < devedor.vencidoDesde)) {
      devedor.vencidoDesde = dia;
    }
  };

  for (const parcela of parcelas) {
    const cobranca = {
      origem: 'manual' as const,
      situacao: parcela.situacao,
      vence: parcela.vencimento,
      pagaEm: parcela.pagaEm,
    };

    if (estaAtrasada(cobranca, hoje)) {
      somar(donoDe(parcela.membroId, parcela.clubeId), 'manual', parcela.valor, parcela.vencimento);
    }
  }

  for (const fatura of faturas) {
    const contrato = fatura.contratoId === null ? undefined : contratoPorId.get(fatura.contratoId);
    const cobranca = {
      origem: 'automatico' as const,
      situacao: fatura.invoiceStatus,
      vence: fatura.dueAt,
      pagaEm: fatura.paidAt,
    };

    if (contrato !== undefined && estaAtrasada(cobranca, hoje)) {
      somar(donoDe(contrato.membroId, contrato.clubeId), 'automatico', fatura.amount, fatura.dueAt);
    }
  }

  for (const membro of membros) {
    if (membro.inadimplenciaMarcada === true) {
      somar(
        { tipo: 'membro', id: membro.id },
        'marcacao',
        membro.inadimplenciaValor,
        membro.inadimplenciaVencimento,
      );
    }
  }

  const devedores = [...porDono.values()].map((devedor) => ({
    ...devedor,
    origens: ORIGENS.filter((origem) => devedor.vencidasPorOrigem[origem] > 0),
    diasDeAtraso:
      devedor.vencidoDesde === null ? null : Math.max(0, diasEntre(devedor.vencidoDesde, hoje)),
  }));

  // Quem deve há mais tempo primeiro: é por onde a cobrança começa. Sem data
  // (marcado sem vencimento) vai para o fim, e o valor desempata.
  return devedores.sort(
    (a, b) =>
      (b.diasDeAtraso ?? -1) - (a.diasDeAtraso ?? -1) ||
      b.valorEmAtraso - a.valorEmAtraso ||
      a.nome.localeCompare(b.nome, 'pt-BR'),
  );
};

export type ResumoDosDevedores = {
  pessoas: number;
  valorEmAtraso: number;
  pessoasPorOrigem: Record<Origem, number>;
};

export const resumirDevedores = (devedores: readonly Devedor[]): ResumoDosDevedores => ({
  pessoas: devedores.length,
  valorEmAtraso: devedores.reduce((soma, devedor) => soma + devedor.valorEmAtraso, 0),
  pessoasPorOrigem: {
    manual: devedores.filter((devedor) => devedor.origens.includes('manual')).length,
    automatico: devedores.filter((devedor) => devedor.origens.includes('automatico')).length,
    marcacao: devedores.filter((devedor) => devedor.origens.includes('marcacao')).length,
  },
});
