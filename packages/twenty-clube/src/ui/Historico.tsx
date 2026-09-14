import { dataHora } from './format';
import { Vazio } from './primitives';

type Linha = {
  id: string;
  name: string;
  happensAt: string | null;
  createdAt: string | null;
  properties: { diff?: Record<string, { before: unknown; after: unknown }> } | null;
};

const ACAO: Record<string, string> = {
  created: 'Criado',
  updated: 'Atualizado',
  deleted: 'Excluído',
  restored: 'Restaurado',
};

const valor = (bruto: unknown): string => {
  if (bruto === null || bruto === undefined || bruto === '') {
    return '—';
  }

  return typeof bruto === 'object' ? JSON.stringify(bruto) : String(bruto);
};

export const Historico = ({ linhas }: { linhas: Linha[] }) => {
  if (linhas.length === 0) {
    return <Vazio>Ainda não há atividade neste registro.</Vazio>;
  }

  return (
    <div>
      {linhas.map((linha) => {
        const diff = Object.entries(linha.properties?.diff ?? {});

        return (
          <div className="adm-step" key={linha.id}>
            <span className="adm-step__label">
              <strong>{ACAO[linha.name] ?? linha.name}</strong>
              {diff.length > 0 && (
                <span className="adm-table__sub">
                  {diff
                    .map(([campo, mudanca]) => `${campo}: ${valor(mudanca.before)} → ${valor(mudanca.after)}`)
                    .join(' · ')}
                </span>
              )}
            </span>
            <span className="adm-step__state">{dataHora(linha.happensAt ?? linha.createdAt)}</span>
          </div>
        );
      })}
    </div>
  );
};
