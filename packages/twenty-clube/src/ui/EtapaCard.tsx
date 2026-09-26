import { useRef, useState } from 'react';

import { gql } from 'src/api/client';
import { type Etapa } from 'src/api/types';
import { AlternarVisao, useModoVisao } from './primitives';
import { subirAnexo, type Anexo } from './anexos';
import { dataCurta } from './format';
import { ExigenciaDaEtapa } from './ExigenciaDaEtapa';
import { ehOpcional } from './exigencia';

const ATUALIZAR = `
  mutation AtualizarEtapa($id: UUID!, $data: EtapaJornadaUpdateInput!) {
    updateEtapaJornada(id: $id, data: $data) {
      id situacao concluidaEm observacoes responsavel prazo opcional
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
        {ehOpcional(etapa) && <span className="adm-chip adm-chip--slate">Opcional</span>}
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

      <ExigenciaDaEtapa
        etapa={etapa}
        onMudou={(opcional) => onMudou({ ...etapa, opcional })}
      />

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

// A mesma etapa em uma linha: concluir, prazo e observação continuam
// editáveis aqui, senão trocar para lista viraria um modo só de leitura.
const EtapaLinha = ({
  etapa,
  numero,
  onMudou,
}: {
  etapa: EtapaCompleta;
  numero: number;
  onMudou: (proxima: EtapaCompleta) => void;
}) => {
  const [ocupado, setOcupado] = useState(false);
  const concluida = etapa.situacao === 'CONCLUIDA';
  const anexos = etapa.attachments?.edges.length ?? 0;

  const salvar = async (mudancas: Record<string, unknown>) => {
    setOcupado(true);

    try {
      const resposta = await gql<{ updateEtapaJornada: EtapaCompleta }>(ATUALIZAR, {
        id: etapa.id,
        data: mudancas,
      });

      onMudou({ ...etapa, ...resposta.updateEtapaJornada });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <tr>
      <td className="adm-etapalista__num">{numero}</td>
      <td>
        <button
          type="button"
          disabled={ocupado}
          aria-label={concluida ? 'Marcar como pendente' : 'Marcar como concluída'}
          className={
            concluida
              ? 'adm-etapalista__check adm-etapalista__check--on'
              : 'adm-etapalista__check'
          }
          onClick={() =>
            void salvar({
              situacao: concluida ? 'PENDENTE' : 'CONCLUIDA',
              concluidaEm: concluida ? null : hoje(),
            })
          }
        >
          ✓
        </button>
      </td>
      <td>
        <span className="adm-etapalista__nome">{etapa.name}</span>
        {ehOpcional(etapa) && (
          <span className="adm-chip adm-chip--slate" style={{ marginLeft: 6 }}>
            Opcional
          </span>
        )}
        {(etapa.observacoes ?? '') !== '' && (
          <div className="adm-etapalista__meta">{etapa.observacoes}</div>
        )}
      </td>
      <td className="adm-table__muted">{dataCurta(etapa.concluidaEm)}</td>
      <td className="adm-table__muted">{dataCurta(etapa.prazo)}</td>
      <td className="adm-table__muted">{anexos === 0 ? '—' : `${anexos} anexo(s)`}</td>
      <td>
        {concluida ? (
          <span className="adm-chip adm-chip--green">Concluída</span>
        ) : (
          <span className="adm-chip adm-chip--slate">Pendente</span>
        )}
      </td>
    </tr>
  );
};

type Filtro = 'todas' | 'pendentes' | 'andamento' | 'concluidas';

const FILTROS: { id: Filtro; rotulo: string; icone: string }[] = [
  { id: 'todas', rotulo: 'Todas', icone: '▦' },
  { id: 'pendentes', rotulo: 'Pendentes', icone: '○' },
  { id: 'andamento', rotulo: 'Em andamento', icone: '◐' },
  { id: 'concluidas', rotulo: 'Concluídas', icone: '✓' },
];

const casa = (etapa: EtapaCompleta, filtro: Filtro): boolean => {
  switch (filtro) {
    case 'todas':
      return true;
    case 'concluidas':
      return etapa.situacao === 'CONCLUIDA';
    case 'andamento':
      return etapa.situacao === 'EM_ANDAMENTO';
    case 'pendentes':
      return etapa.situacao !== 'CONCLUIDA' && etapa.situacao !== 'EM_ANDAMENTO';
  }
};

export const EtapasEmCards = ({
  etapas,
  onMudou,
  superficie = 'jornada',
}: {
  etapas: EtapaCompleta[];
  onMudou: (proxima: EtapaCompleta) => void;
  superficie?: string;
}) => {
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [modo, setModo] = useModoVisao(superficie, 'cards');

  const concluidas = etapas.filter((etapa) => etapa.situacao === 'CONCLUIDA').length;
  // A numeração é a posição na jornada inteira, não na lista filtrada: a etapa
  // 7 continua sendo a 7 mesmo quando só as pendentes estão na tela.
  const numeradas = etapas.map((etapa, indice) => ({ etapa, numero: indice + 1 }));
  const visiveis = numeradas.filter((item) => casa(item.etapa, filtro));

  return (
    <>
      <div className="adm-etapas__barra">
        <div className="adm-filtros">
          {FILTROS.map((item) => {
            const quantas = etapas.filter((etapa) => casa(etapa, item.id)).length;

            return (
              <button
                key={item.id}
                type="button"
                className={item.id === filtro ? 'adm-filtro adm-filtro--on' : 'adm-filtro'}
                onClick={() => setFiltro(item.id)}
              >
                <span className="adm-filtro__icone" aria-hidden="true">
                  {item.icone}
                </span>
                {item.rotulo}
                <span className="adm-filtro__contador">{quantas}</span>
              </button>
            );
          })}
        </div>

        <AlternarVisao modo={modo} onChange={setModo} />

        <div className="adm-etapas__progresso">
          <span className="adm-etapas__barra-trilho">
            <span
              className="adm-etapas__barra-preenchida"
              style={{ width: `${etapas.length === 0 ? 0 : (concluidas / etapas.length) * 100}%` }}
            />
          </span>
          <span className="adm-etapas__numero">
            {concluidas} de {etapas.length}
          </span>
        </div>
      </div>

      {visiveis.length === 0 ? (
        <div className="adm-empty">Nenhuma etapa nesse filtro.</div>
      ) : modo === 'lista' ? (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>#</th>
                <th />
                <th>Etapa</th>
                <th>Concluída em</th>
                <th>Prazo</th>
                <th>Anexos</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((item) => (
                <EtapaLinha
                  key={item.etapa.id}
                  etapa={item.etapa}
                  numero={item.numero}
                  onMudou={onMudou}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="adm-etapas">
          {visiveis.map((item) => (
            <EtapaCard
              key={item.etapa.id}
              etapa={item.etapa}
              numero={item.numero}
              onMudou={onMudou}
            />
          ))}
        </div>
      )}
    </>
  );
};
