import { useState } from 'react';

import { baixarArquivo, exportarPlanilha } from './exportacao';

type Qual = 'clubes' | 'membros';

// A planilha leva CPF, e-mail e telefone — os mesmos dados que quem está
// logado já vê na tela, mas fora dela ninguém controla para onde vão.
export const ExportarDados = () => {
  const [aberto, setAberto] = useState(false);
  const [andamento, setAndamento] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const exportar = async (qual: Qual) => {
    setAberto(false);
    setErro(null);
    setAndamento(qual === 'clubes' ? 'Exportando clubes…' : 'Exportando membros…');

    try {
      const planilha = await exportarPlanilha(qual, setAndamento);

      baixarArquivo(planilha);
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não conseguimos gerar a planilha.');
    } finally {
      setAndamento(null);
    }
  };

  return (
    <span className="adm-menu-ancora">
      <button
        type="button"
        className="adm-btn"
        aria-haspopup="menu"
        aria-expanded={aberto}
        disabled={andamento !== null}
        onClick={() => setAberto((atual) => !atual)}
      >
        {andamento ?? 'Exportar ▾'}
      </button>

      {aberto && (
        <>
          <button
            type="button"
            className="adm-menu-fundo"
            aria-label="Fechar o menu"
            onClick={() => setAberto(false)}
          />
          <div className="adm-menu" role="menu">
            <button type="button" role="menuitem" className="adm-menu__item" onClick={() => void exportar('clubes')}>
              Clubes <span>planilha CSV</span>
            </button>
            <button type="button" role="menuitem" className="adm-menu__item" onClick={() => void exportar('membros')}>
              Membros <span>planilha CSV</span>
            </button>
            <p className="adm-menu__nota">
              Todos os campos do cadastro, com a situação financeira. Tem dados pessoais (CPF,
              e-mail, telefone): guarde com cuidado.
            </p>
          </div>
        </>
      )}

      {erro !== null && <span className="adm-menu__erro">{erro}</span>}
    </span>
  );
};
