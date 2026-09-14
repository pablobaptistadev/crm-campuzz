import { type ReactNode } from 'react';

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
} as const;

const ROTULOS: Record<string, string> = {
  ATIVO: 'Ativo',
  PAUSADO: 'Pausado',
  INATIVO: 'Inativo',
  PERDIDO: 'Perdido',
  FAZER_MOU: 'Fazer MOU',
  PENDENTE: 'Pendente',
  ENVIADO: 'Enviado',
  ASSINADO: 'Assinado',
  EXPIRADO: 'Expirado',
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

export const Chip = ({ valor }: { valor: string | null | undefined }) => {
  if (valor === null || valor === undefined || valor === '') {
    return <span className="adm-table__muted">{TRACO}</span>;
  }

  const tom = TONS[valor as keyof typeof TONS] ?? 'slate';

  return <span className={`adm-chip adm-chip--${tom}`}>{ROTULOS[valor] ?? valor}</span>;
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
