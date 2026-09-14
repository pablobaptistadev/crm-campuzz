import { useRef, useState } from 'react';

import { gql } from 'src/api/client';
import { type Etapa } from 'src/api/types';
import { subirAnexo, type Anexo } from './anexos';
import { dataCurta } from './format';

const ATUALIZAR = `
  mutation AtualizarEtapa($id: UUID!, $data: EtapaJornadaUpdateInput!) {
    updateEtapaJornada(id: $id, data: $data) {
      id situacao concluidaEm observacoes responsavel prazo
    }
  }
`;

export type EtapaCompleta = Etapa & {
  observacoes?: string | null;
  responsavel?: string | null;
  prazo?: string | null;
  attachments?: { edges: { node: Anexo }[] };
};

const hoje = () => new Date().toISOString().slice(0, 10);

export const EtapaCard = ({
  etapa,
  numero,
  onMudou,
}: {
  etapa: EtapaCompleta;
  numero: number;
  onMudou: (proxima: EtapaCompleta) => void;
}) => {
  const [rascunho, setRascunho] = useState(etapa.observacoes ?? '');
  const [editandoNota, setEditandoNota] = useState(false);
  const [anexos, setAnexos] = useState<Anexo[]>(
    (etapa.attachments?.edges ?? []).map((aresta) => aresta.node),
  );
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);

  const concluida = etapa.situacao === 'CONCLUIDA';

  const salvar = async (mudancas: Record<string, unknown>) => {
    setOcupado(true);
    setErro(null);

    try {
      const resposta = await gql<{ updateEtapaJornada: EtapaCompleta }>(ATUALIZAR, {
        id: etapa.id,
        data: mudancas,
      });

      onMudou({ ...etapa, ...resposta.updateEtapaJornada });
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não conseguimos salvar.');
    } finally {
      setOcupado(false);
    }
  };

  const alternar = () =>
    void salvar({
      situacao: concluida ? 'PENDENTE' : 'CONCLUIDA',
      concluidaEm: concluida ? null : hoje(),
    });

  const anexar = async (arquivo: File) => {
    setOcupado(true);
    setErro(null);

    try {
      const novo = await subirAnexo({
        arquivo,
        campoAlvo: 'targetEtapaJornadaId',
        alvoId: etapa.id,
      });

      setAnexos((atual) => [...atual, novo]);
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não conseguimos anexar o arquivo.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <article className={concluida ? 'adm-etapa adm-etapa--on' : 'adm-etapa'}>
      <header className="adm-etapa__head">
        <button
          type="button"
          className={concluida ? 'adm-step__mark adm-step__mark--on' : 'adm-step__mark'}
          aria-pressed={concluida}
          aria-label={concluida ? `Reabrir ${etapa.name}` : `Concluir ${etapa.name}`}
          disabled={ocupado}
          onClick={alternar}
        >
          {concluida ? '✓' : ''}
        </button>
        <span className="adm-etapa__ordem">{numero}</span>
        <span className="adm-etapa__nome">{etapa.name}</span>
      </header>

      {erro !== null && <div className="adm-error">{erro}</div>}

      <div className="adm-etapa__linha">
        <span className="adm-fieldlabel">Concluída em</span>
        <input
          className="adm-input adm-input--data"
          type="date"
          value={etapa.concluidaEm?.slice(0, 10) ?? ''}
          disabled={ocupado}
          onChange={(evento) =>
            void salvar({
              concluidaEm: evento.target.value === '' ? null : evento.target.value,
              situacao: evento.target.value === '' ? etapa.situacao : 'CONCLUIDA',
            })
          }
        />
      </div>

      <div className="adm-etapa__linha">
        <span className="adm-fieldlabel">Prazo</span>
        <input
          className="adm-input adm-input--data"
          type="date"
          value={etapa.prazo?.slice(0, 10) ?? ''}
          disabled={ocupado}
          onChange={(evento) =>
            void salvar({ prazo: evento.target.value === '' ? null : evento.target.value })
          }
        />
      </div>

      <div className="adm-etapa__nota">
        <span className="adm-fieldlabel">Observações</span>
        {editandoNota ? (
          <>
            <textarea
              className="adm-input"
              style={{ width: '100%', minWidth: 0, minHeight: 70, resize: 'vertical' }}
              value={rascunho}
              onChange={(evento) => setRascunho(evento.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                className="adm-btn"
                onClick={() => {
                  setRascunho(etapa.observacoes ?? '');
                  setEditandoNota(false);
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="adm-btn adm-btn--primary"
                disabled={ocupado}
                onClick={() =>
                  void salvar({ observacoes: rascunho.trim() === '' ? null : rascunho }).then(() =>
                    setEditandoNota(false),
                  )
                }
              >
                Salvar
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="adm-etapa__nota-texto" onClick={() => setEditandoNota(true)}>
            {etapa.observacoes ?? 'Adicionar observação'}
          </button>
        )}
      </div>

      <div className="adm-etapa__anexos">
        <span className="adm-fieldlabel">Anexos</span>
        {anexos.length > 0 && (
          <ul className="adm-etapa__lista">
            {anexos.map((anexo) => (
              <li key={anexo.id}>
                <a href={anexo.fullPath ?? '#'} target="_blank" rel="noreferrer">
                  {anexo.name}
                </a>
              </li>
            ))}
          </ul>
        )}
        <input
          ref={inputArquivo}
          type="file"
          style={{ display: 'none' }}
          onChange={(evento) => {
            const arquivo = evento.target.files?.[0];

            evento.target.value = '';

            if (arquivo !== undefined) {
              void anexar(arquivo);
            }
          }}
        />
        <button
          type="button"
          className="adm-btn"
          disabled={ocupado}
          onClick={() => inputArquivo.current?.click()}
        >
          {ocupado ? 'Enviando…' : '+ Anexar arquivo'}
        </button>
      </div>

      <div className="adm-etapa__rodape">
        {concluida ? (
          <span className="adm-chip adm-chip--green">Concluída {dataCurta(etapa.concluidaEm)}</span>
        ) : (
          <span className="adm-chip adm-chip--slate">Pendente</span>
        )}
      </div>
    </article>
  );
};

export const EtapasEmCards = ({
  etapas,
  onMudou,
}: {
  etapas: EtapaCompleta[];
  onMudou: (proxima: EtapaCompleta) => void;
}) => (
  <div className="adm-etapas">
    {etapas.map((etapa, indice) => (
      <EtapaCard key={etapa.id} etapa={etapa} numero={indice + 1} onMudou={onMudou} />
    ))}
  </div>
);
