import { type ReactNode, useState } from 'react';

import { TRACO } from './format';

export const Card = ({
  titulo,
  acao,
  flush = false,
  children,
}: {
  titulo: string;
  acao?: ReactNode;
  flush?: boolean;
  children: ReactNode;
}) => (
  <section className="adm-card">
    <header className="adm-card__head">
      <span className="adm-card__title">{titulo}</span>
      {acao}
    </header>
    <div className={flush ? 'adm-card__body adm-card__body--flush' : 'adm-card__body'}>
      {children}
    </div>
  </section>
);

export const Campo = ({ rotulo, valor }: { rotulo: string; valor: ReactNode }) => {
  const vazio = valor === TRACO || valor === null || valor === undefined || valor === '';

  return (
    <div>
      <div className="adm-fieldlabel">{rotulo}</div>
      <div className={vazio ? 'adm-fieldvalue adm-fieldvalue--empty' : 'adm-fieldvalue'}>
        {vazio ? TRACO : valor}
      </div>
    </div>
  );
};

export const Secao = ({ children }: { children: ReactNode }) => (
  <div className="adm-section">{children}</div>
);

export const Grid = ({ colunas = 3, children }: { colunas?: 2 | 3; children: ReactNode }) => (
  <div className={`adm-grid adm-grid--${colunas}`}>{children}</div>
);

const TONS = {
  ATIVO: 'green',
  CONCLUIDA: 'green',
  ASSINADO: 'green',
  PAGA: 'green',
  RESOLVIDA: 'green',
  FAZER_MOU: 'blue',
  ENVIADO: 'blue',
  EM_ANDAMENTO: 'blue',
  PAUSADO: 'gold',
  PENDENTE: 'slate',
  ABERTA: 'gold',
  INATIVO: 'slate',
  PERDIDO: 'rose',
  EXPIRADO: 'rose',
  ATRASADA: 'rose',
  // Contrato dividido entre sócios: não é pendência nem problema, só outro
  // arranjo — uma cor própria para não se confundir com nenhum dos dois.
  RATEIO: 'violet',
  // Situação da conexão com o gateway de pagamento.
  ACTIVE: 'green',
  INVALID: 'rose',
  PENDING: 'slate',
  // Situação da fatura do financeiro automático. PENDING já está acima, vindo
  // da conexão com o gateway — mesmo valor, mesmo sentido.
  PAID: 'green',
  WAITING_PAYMENT: 'gold',
  OVERDUE: 'rose',
  EXPIRED: 'slate',
  CANCELED: 'slate',
} as const;

const ROTULOS: Record<string, string> = {
  // Situação do contrato: fica como a Routerfy manda, em coluna de texto livre,
  // e só é traduzida aqui — na tela, que é em português.
  finished: 'Encerrado',
  active: 'Ativo',
  paid: 'Pago',
  pending: 'Pendente',
  canceled: 'Cancelado',
  cancelled: 'Cancelado',
  unknown: 'Não informada',
  PAID: 'Paga',
  WAITING_PAYMENT: 'Aguardando pagamento',
  OVERDUE: 'Vencida',
  EXPIRED: 'Expirada',
  CANCELED: 'Cancelada',
  ACTIVE: 'Ativa',
  INVALID: 'Chaves inválidas',
  PENDING: 'Pendente',
  ATIVO: 'Ativo',
  PAUSADO: 'Pausado',
  INATIVO: 'Inativo',
  PERDIDO: 'Perdido',
  FAZER_MOU: 'Fazer MOU',
  PENDENTE: 'Pendente',
  ENVIADO: 'Enviado',
  ASSINADO: 'Assinado',
  EXPIRADO: 'Expirado',
  RATEIO: 'Rateio',
  CONCLUIDA: 'Concluída',
  EM_ANDAMENTO: 'Em andamento',
  PAGA: 'Paga',
  ATRASADA: 'Atrasada',
  ABERTA: 'Aberta',
  RESOLVIDA: 'Resolvida',
  MENTORADO: 'Mentorado',
  MENTOR: 'Mentor',
  SOCIO: 'Sócio',
  CONVIDADO: 'Convidado',
};

export const Chip = ({
  valor,
  sufixo,
}: {
  valor: string | null | undefined;
  // A seta de "dá para trocar" mora dentro da pílula: do lado de fora ela
  // vira um ícone solto que não se lê como parte do mesmo controle.
  sufixo?: ReactNode;
}) => {
  if (valor === null || valor === undefined || valor === '') {
    return sufixo === undefined ? (
      <span className="adm-table__muted">{TRACO}</span>
    ) : (
      <span className="adm-chip adm-chip--slate">
        {TRACO}
        {sufixo}
      </span>
    );
  }

  const tom = TONS[valor as keyof typeof TONS] ?? 'slate';

  return (
    <span className={`adm-chip adm-chip--${tom}`}>
      {ROTULOS[valor] ?? valor}
      {sufixo}
    </span>
  );
};

export const rotuloDe = (valor: string | null | undefined): string =>
  valor === null || valor === undefined ? TRACO : (ROTULOS[valor] ?? valor);

// Seis bolinhas, uma por etapa do pipeline, como no painel de referência.
export const Pipeline = ({ concluidas, total = 6 }: { concluidas: number; total?: number }) => (
  <span className="adm-pipeline" title={`${concluidas} de ${total} etapas`}>
    {Array.from({ length: total }, (_, indice) => (
      <span
        key={indice}
        className={indice < concluidas ? 'adm-pipeline__dot adm-pipeline__dot--on' : 'adm-pipeline__dot'}
      />
    ))}
  </span>
);

export const Tabs = <T extends string>({
  itens,
  valor,
  onChange,
}: {
  itens: { id: T; rotulo: string; contagem?: number }[];
  valor: T;
  onChange: (id: T) => void;
}) => (
  <div className="adm-tabs" role="tablist">
    {itens.map((item) => (
      <button
        key={item.id}
        type="button"
        role="tab"
        aria-selected={item.id === valor}
        className={item.id === valor ? 'adm-tab adm-tab--on' : 'adm-tab'}
        onClick={() => onChange(item.id)}
      >
        {item.rotulo}
        {item.contagem !== undefined && <span className="adm-tab__count">{item.contagem}</span>}
      </button>
    ))}
  </div>
);

export const Vazio = ({ children }: { children: ReactNode }) => (
  <div className="adm-empty">{children}</div>
);

export type ModoVisao = 'cards' | 'lista';

// A escolha é de quem olha, não do registro: fica no navegador e vale para a
// mesma superfície em qualquer clube, senão volta para cards a cada clique.
const chaveModo = (superficie: string) => `campuzz.modo.${superficie}`;

export const lerModo = (superficie: string, padrao: ModoVisao): ModoVisao => {
  try {
    const salvo = window.localStorage.getItem(chaveModo(superficie));

    return salvo === 'cards' || salvo === 'lista' ? salvo : padrao;
  } catch {
    // Navegador anônimo ou storage bloqueado: o padrão da tela resolve.
    return padrao;
  }
};

export const useModoVisao = (superficie: string, padrao: ModoVisao = 'cards') => {
  const [modo, setModo] = useState<ModoVisao>(() => lerModo(superficie, padrao));

  const trocar = (proximo: ModoVisao) => {
    setModo(proximo);

    try {
      window.localStorage.setItem(chaveModo(superficie), proximo);
    } catch {
      // Não poder lembrar a escolha não pode impedir de trocar de modo.
    }
  };

  return [modo, trocar] as const;
};

export const AlternarVisao = ({
  modo,
  onChange,
}: {
  modo: ModoVisao;
  onChange: (proximo: ModoVisao) => void;
}) => (
  <div className="adm-visao" role="group" aria-label="Modo de exibição">
    <button
      type="button"
      className={modo === 'lista' ? 'adm-visao__btn adm-visao__btn--on' : 'adm-visao__btn'}
      aria-pressed={modo === 'lista'}
      title="Ver em lista"
      onClick={() => onChange('lista')}
    >
      <span aria-hidden="true">☰</span> Lista
    </button>
    <button
      type="button"
      className={modo === 'cards' ? 'adm-visao__btn adm-visao__btn--on' : 'adm-visao__btn'}
      aria-pressed={modo === 'cards'}
      title="Ver em cards"
      onClick={() => onChange('cards')}
    >
      <span aria-hidden="true">▦</span> Cards
    </button>
  </div>
);
