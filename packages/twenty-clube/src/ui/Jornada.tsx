import { useState } from 'react';

import { ATUALIZAR_ETAPA } from 'src/api/queries';
import { gql } from 'src/api/client';
import { type Etapa } from 'src/api/types';
import { dataCurta } from './format';
import { Vazio } from './primitives';

const hoje = () => new Date().toISOString().slice(0, 10);

export const Jornada = ({ etapas }: { etapas: Etapa[] }) => {
  const [estado, setEstado] = useState(etapas);
  const [salvando, setSalvando] = useState<string | null>(null);

  if (estado.length === 0) {
    return <Vazio>Nenhuma etapa cadastrada.</Vazio>;
  }

  const alternar = async (etapa: Etapa) => {
    const concluida = etapa.situacao === 'CONCLUIDA';
    const proxima: Etapa = {
      ...etapa,
      situacao: concluida ? 'PENDENTE' : 'CONCLUIDA',
      concluidaEm: concluida ? null : hoje(),
    };

    // Pintamos antes de confirmar; se a escrita falhar, a linha volta ao que era.
    setEstado((atual) => atual.map((linha) => (linha.id === etapa.id ? proxima : linha)));
    setSalvando(etapa.id);

    try {
      await gql(ATUALIZAR_ETAPA, {
        id: etapa.id,
        data: { situacao: proxima.situacao, concluidaEm: proxima.concluidaEm },
      });
    } catch {
      setEstado((atual) => atual.map((linha) => (linha.id === etapa.id ? etapa : linha)));
    } finally {
      setSalvando(null);
    }
  };

  return (
    <div>
      {estado.map((etapa) => {
        const concluida = etapa.situacao === 'CONCLUIDA';

        return (
          <div className="adm-step" key={etapa.id}>
            <button
              type="button"
              aria-label={concluida ? `Reabrir ${etapa.name}` : `Concluir ${etapa.name}`}
              aria-pressed={concluida}
              disabled={salvando === etapa.id}
              className={concluida ? 'adm-step__mark adm-step__mark--on' : 'adm-step__mark'}
              onClick={() => void alternar(etapa)}
            >
              {concluida ? '✓' : ''}
            </button>
            <span className="adm-step__label">{etapa.name}</span>
            <span className={concluida ? 'adm-step__state adm-step__state--on' : 'adm-step__state'}>
              {concluida
                ? etapa.concluidaEm !== null
                  ? dataCurta(etapa.concluidaEm)
                  : 'Concluído'
                : etapa.situacao === 'EM_ANDAMENTO'
                  ? 'Em andamento'
                  : 'Pendente'}
            </span>
          </div>
        );
      })}
    </div>
  );
};
