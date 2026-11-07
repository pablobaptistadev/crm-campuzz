import { type FormEvent, type ReactNode } from 'react';

// A moldura das telas sem sessão: login, código e senha nova têm a mesma cara,
// e quem passa de uma para a outra não deve achar que saiu do sistema.
export const CartaoDeAcesso = ({
  titulo,
  explicacao,
  onSubmit,
  children,
}: {
  titulo?: string;
  explicacao?: string;
  onSubmit: () => void;
  children: ReactNode;
}) => (
  <div
    style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      padding: 24,
      background: 'var(--bg)',
    }}
  >
    <form
      onSubmit={(evento: FormEvent) => {
        evento.preventDefault();
        onSubmit();
      }}
      style={{
        width: '100%',
        maxWidth: 380,
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        background: 'var(--bg-elev-1)',
        padding: 28,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
        <span className="adm-banner__glyph">CC</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>CRM Campuzz</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sistema de Parceiros</div>
        </div>
      </div>

      {titulo !== undefined && (
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{titulo}</div>
      )}
      {explicacao !== undefined && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
          {explicacao}
        </div>
      )}

      {children}
    </form>
  </div>
);

export const CampoDeAcesso = ({
  rotulo,
  acessorio,
  children,
}: {
  rotulo: string;
  acessorio?: ReactNode;
  children: ReactNode;
}) => (
  <div style={{ marginBottom: 14 }}>
    <div
      style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}
    >
      <div className="adm-fieldlabel">{rotulo}</div>
      {acessorio}
    </div>
    {children}
  </div>
);

export const AcoesSecundarias = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 8,
      marginTop: 14,
    }}
  >
    {children}
  </div>
);
