import { useState } from 'react';

import { gql } from 'src/api/client';
import { dataCurta } from './format';

export type Pendencia = {
  id: string;
  name: string;
  descricao: string | null;
  situacao: string | null;
  prazo: string | null;
  resolvidaEm: string | null;
};

const CRIAR = `
  mutation CriarPendencia($data: PendenciaCreateInput!) {
    createPendencia(data: $data) { id name descricao situacao prazo resolvidaEm }
  }
`;

const ATUALIZAR = `
  mutation AtualizarPendencia($id: UUID!, $data: PendenciaUpdateInput!) {
    updatePendencia(id: $id, data: $data) { id name descricao situacao prazo resolvidaEm }
  }
`;

const REMOVER = `
  mutation RemoverPendencia($id: UUID!) {
    deletePendencia(id: $id) { id }
  }
`;

const hoje = () => new Date().toISOString().slice(0, 10);

const textoDe = (pendencia: Pendencia) => pendencia.descricao ?? pendencia.name;

export const Pendencias = ({
  membroId,
  pendencias,
  onMudou,
}: {
  membroId: string;
  pendencias: Pendencia[];
  onMudou: (proximas: Pendencia[]) => void;
}) => {
  const [texto, setTexto] = useState('');
  const [prazo, setPrazo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const abertas = pendencias.filter((item) => item.situacao !== 'RESOLVIDA').length;

  const adicionar = async () => {
    if (texto.trim() === '') {
      setErro('Escreva o que está pendente.');

      return;
    }

    setOcupado(true);
    setErro(null);

    try {
      const criada = await gql<{ createPendencia: Pendencia }>(CRIAR, {
        data: {
          // O name é o identificador que a timeline e a busca mostram; deixá-lo
          // vazio faria a pendência aparecer sem nome nos dois lugares.
          name: texto.trim(),
          descricao: texto.trim(),
          situacao: 'ABERTA',
          prazo: prazo === '' ? null : prazo,
          membroId,
          position: 'last',
        },
      });

      onMudou([...pendencias, criada.createPendencia]);
      setTexto('');
      setPrazo('');
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não conseguimos adicionar.');
    } finally {
      setOcupado(false);
    }
  };

  const aplicar = async (pendencia: Pendencia, mudancas: Partial<Pendencia>) => {
    onMudou(
      pendencias.map((item) =>
        item.id === pendencia.id ? { ...item, ...mudancas } : item,
      ),
    );

    await gql(ATUALIZAR, { id: pendencia.id, data: mudancas }).catch((causa: unknown) =>
      setErro(causa instanceof Error ? causa.message : 'Não conseguimos salvar.'),
    );
  };

  // Resolver e reabrir andam com a data: uma pendência resolvida sem data de
  // resolução não diz quando saiu do caminho, e uma reaberta que guarda a data
  // antiga mente.
  const alternar = (pendencia: Pendencia) =>
    void aplicar(
      pendencia,
      pendencia.situacao === 'RESOLVIDA'
        ? { situacao: 'ABERTA', resolvidaEm: null }
        : { situacao: 'RESOLVIDA', resolvidaEm: hoje() },
    );

  const remover = async (pendencia: Pendencia) => {
    setOcupado(true);

    try {
      await gql(REMOVER, { id: pendencia.id });
      onMudou(pendencias.filter((item) => item.id !== pendencia.id));
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não conseguimos remover.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="adm-card__body">
      {erro !== null && <div className="adm-error">{erro}</div>}

      {pendencias.length === 0 ? (
        <div className="adm-fieldvalue adm-fieldvalue--empty" style={{ marginBottom: 14 }}>
          Nenhuma pendência aberta.
        </div>
      ) : (
        <div className="adm-pendencias">
          {pendencias.map((pendencia) => {
            const resolvida = pendencia.situacao === 'RESOLVIDA';

            return (
              <div
                className={resolvida ? 'adm-pendencia adm-pendencia--ok' : 'adm-pendencia'}
                key={pendencia.id}
              >
                <button
                  type="button"
                  className={resolvida ? 'adm-check adm-check--on' : 'adm-check'}
                  aria-label={
                    resolvida
                      ? `Reabrir ${textoDe(pendencia)}`
                      : `Resolver ${textoDe(pendencia)}`
                  }
                  onClick={() => alternar(pendencia)}
                >
                  ✓
                </button>

                <input
                  className="adm-input adm-pendencia__texto"
                  aria-label={`Pendência: ${textoDe(pendencia)}`}
                  defaultValue={textoDe(pendencia)}
                  onBlur={(evento) => {
                    const proximo = evento.target.value.trim();

                    if (proximo !== '' && proximo !== textoDe(pendencia)) {
                      void aplicar(pendencia, { name: proximo, descricao: proximo });
                    }
                  }}
                />

                <input
                  className="adm-input"
                  type="date"
                  aria-label={`Prazo de ${textoDe(pendencia)}`}
                  defaultValue={pendencia.prazo?.slice(0, 10) ?? ''}
                  onBlur={(evento) => {
                    const proximo = evento.target.value === '' ? null : evento.target.value;

                    if (proximo !== (pendencia.prazo ?? null)) {
                      void aplicar(pendencia, { prazo: proximo });
                    }
                  }}
                />

                <span className="adm-pendencia__quando">
                  {resolvida && pendencia.resolvidaEm !== null
                    ? `Resolvida ${dataCurta(pendencia.resolvidaEm)}`
                    : ''}
                </span>

                <button
                  type="button"
                  className="adm-btn adm-btn--perigo adm-btn--pequeno"
                  disabled={ocupado}
                  onClick={() => void remover(pendencia)}
                >
                  Remover
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="adm-pendencia adm-pendencia--nova">
        <span className="adm-check adm-check--vazio" aria-hidden="true" />
        <input
          className="adm-input adm-pendencia__texto"
          placeholder="O que ficou pendente?"
          aria-label="Nova pendência"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === 'Enter') {
              void adicionar();
            }
          }}
        />
        <input
          className="adm-input"
          type="date"
          aria-label="Prazo da nova pendência"
          value={prazo}
          onChange={(evento) => setPrazo(evento.target.value)}
        />
        <span className="adm-pendencia__quando" />
        <button
          type="button"
          className="adm-btn adm-btn--primary adm-btn--pequeno"
          disabled={ocupado}
          onClick={() => void adicionar()}
        >
          {ocupado ? 'Salvando…' : 'Adicionar'}
        </button>
      </div>

      {pendencias.length > 0 && (
        <div className="adm-pendencias__resumo">
          {abertas === 0
            ? 'Tudo resolvido.'
            : `${abertas} ${abertas === 1 ? 'pendência aberta' : 'pendências abertas'} de ${pendencias.length}.`}
        </div>
      )}
    </div>
  );
};
