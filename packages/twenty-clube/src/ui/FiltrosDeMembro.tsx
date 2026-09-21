import { type CampoMeta } from 'src/api/metadata';
import {
  type ContratosDoRegistro,
  cobrancasDe,
  situacaoDeCobranca,
} from 'src/ui/atraso';

export type MembroFiltravel = {
  name: string | null;
  situacao: string | null;
  contratoSituacao: string | null;
  emails: { primaryEmail: string | null } | null;
  emailFinanceiro?: string | null;
  parcelas?: { edges: { node: { situacao: string | null; vencimento: string | null; pagaEm: string | null } }[] } | null;
  contratos?: ContratosDoRegistro;
};

export type FiltroDeMembro = {
  busca: string;
  contrato: string;
  financeiro: '' | 'EM_ATRASO' | 'EM_DIA';
};

export const FILTRO_DE_MEMBRO_VAZIO: FiltroDeMembro = {
  busca: '',
  contrato: '',
  financeiro: '',
};

export const temFiltroAtivo = (filtro: FiltroDeMembro): boolean =>
  filtro.busca.trim() !== '' ||
  filtro.contrato !== '' ||
  filtro.financeiro !== '';

// Sem acento e sem caixa: quem procura "sergio" tem de achar "Sérgio", senão o
// campo só serve para quem já sabe escrever o nome do jeito que foi cadastrado.
const comparavel = (valor: string): string =>
  valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const casaABusca = (membro: MembroFiltravel, busca: string): boolean => {
  const alvo = comparavel(busca);

  if (alvo === '') {
    return true;
  }

  return [
    membro.name,
    membro.emails?.primaryEmail,
    membro.emailFinanceiro,
  ].some((campo) => campo != null && comparavel(campo).includes(alvo));
};

export const estaEmAtraso = (membro: MembroFiltravel): boolean =>
  situacaoDeCobranca(
    cobrancasDe({
      parcelas: (membro.parcelas?.edges ?? []).map((aresta) => aresta.node),
      contratos: membro.contratos ?? null,
    }),
  ).emAtraso;

export const filtrarMembros = <TMembro extends MembroFiltravel>(
  membros: readonly TMembro[],
  filtro: FiltroDeMembro,
): TMembro[] =>
  membros.filter((membro) => {
    if (!casaABusca(membro, filtro.busca)) {
      return false;
    }

    if (filtro.contrato !== '' && membro.contratoSituacao !== filtro.contrato) {
      return false;
    }

    if (filtro.financeiro === '') {
      return true;
    }

    return estaEmAtraso(membro) === (filtro.financeiro === 'EM_ATRASO');
  });

export const FiltrosDeMembro = ({
  valor,
  onMudou,
  opcoesDeContrato,
}: {
  valor: FiltroDeMembro;
  onMudou: (filtro: FiltroDeMembro) => void;
  opcoesDeContrato: CampoMeta['options'];
}) => (
  <div className="adm-filtros">
    <input
      className="adm-input adm-filtros__busca"
      type="search"
      value={valor.busca}
      placeholder="Buscar por nome ou e-mail"
      aria-label="Buscar por nome ou e-mail"
      onChange={(evento) => onMudou({ ...valor, busca: evento.target.value })}
    />

    <select
      className="adm-input"
      value={valor.contrato}
      aria-label="Status do contrato"
      onChange={(evento) => onMudou({ ...valor, contrato: evento.target.value })}
    >
      <option value="">Contrato: todos</option>
      {(opcoesDeContrato ?? []).map((opcao) => (
        <option key={opcao.value} value={opcao.value}>
          {opcao.label}
        </option>
      ))}
    </select>

    <select
      className="adm-input"
      value={valor.financeiro}
      aria-label="Situação financeira"
      onChange={(evento) =>
        onMudou({
          ...valor,
          financeiro: evento.target.value as FiltroDeMembro['financeiro'],
        })
      }
    >
      <option value="">Financeiro: todos</option>
      <option value="EM_ATRASO">Em atraso</option>
      <option value="EM_DIA">Em dia</option>
    </select>

    {temFiltroAtivo(valor) && (
      <button
        type="button"
        className="adm-btn"
        onClick={() => onMudou(FILTRO_DE_MEMBRO_VAZIO)}
      >
        Limpar
      </button>
    )}
  </div>
);
