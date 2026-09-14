import { useState } from 'react';

import { gql } from 'src/api/client';

// Arquivar é soft delete: o registro some das listas e o histórico continua
// lá. Por isso o texto fala em arquivar, não em excluir — quem lê precisa
// saber que dá para voltar atrás.
export const Arquivar = ({
  mutation,
  registroId,
  nome,
  oQue,
  onArquivado,
}: {
  mutation: string;
  registroId: string;
  nome: string;
  oQue: 'clube' | 'membro';
  onArquivado: () => void;
}) => {
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const arquivar = async () => {
    setSalvando(true);
    setErro(null);

    try {
      await gql(mutation, { id: registroId });
      onArquivado();
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não conseguimos arquivar.');
      setSalvando(false);
    }
  };

  if (!confirmando) {
    return (
      <button type="button" className="adm-btn adm-btn--perigo" onClick={() => setConfirmando(true)}>
        Arquivar
      </button>
    );
  }

  return (
    <div className="adm-modal" role="dialog" aria-label={`Arquivar ${oQue}`}>
      <div className="adm-modal__caixa" style={{ maxWidth: 460 }}>
        <header className="adm-card__head">
          <span className="adm-card__title">Arquivar {oQue}</span>
        </header>
        <div className="adm-card__body">
          {erro !== null && <div className="adm-error">{erro}</div>}
          <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600 }}>{nome}</p>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 18px' }}>
            {oQue === 'clube'
              ? 'O clube sai do painel. Os membros seguem cadastrados e continuam aparecendo no financeiro e no radar — arquive um a um se quiser tirá-los também.'
              : 'O membro sai da lista do clube, do financeiro e do radar.'}
          </p>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 18px' }}>
            Nada é apagado do banco: dá para trazer de volta em{' '}
            <strong>Arquivados</strong>.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="adm-btn"
              onClick={() => setConfirmando(false)}
              disabled={salvando}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--perigo"
              onClick={() => void arquivar()}
              disabled={salvando}
            >
              {salvando ? 'Arquivando…' : `Arquivar ${oQue}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
