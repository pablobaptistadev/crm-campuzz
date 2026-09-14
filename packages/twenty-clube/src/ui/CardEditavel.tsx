import { useState, type ReactNode } from 'react';

import { gql } from 'src/api/client';
import { type ObjetoMeta } from 'src/api/metadata';
import { CampoEditor, type Rascunho, valorParaLeitura } from './CampoEditor';
import { TRACO } from './format';

const pascal = (nome: string) => nome.charAt(0).toUpperCase() + nome.slice(1);

// Um card em edição guarda só o que mudou; salvar manda esse pedaço e mais
// nada, então dois cards abertos ao mesmo tempo não se sobrescrevem.
export const CardEditavel = ({
  titulo,
  objeto,
  registroId,
  registro,
  campos,
  colunas = 3,
  extra,
  onSalvo,
}: {
  titulo: string;
  objeto: ObjetoMeta;
  registroId: string;
  registro: Record<string, unknown>;
  campos: { nome: string; rotulo?: string }[];
  colunas?: 2 | 3;
  extra?: ReactNode;
  onSalvo: (mudancas: Record<string, unknown>) => void;
}) => {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState<Rascunho>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const visiveis = campos
    .map((item) => ({ ...item, meta: objeto.campoPorNome.get(item.nome) }))
    .filter((item) => item.meta !== undefined);

  const cancelar = () => {
    setRascunho({});
    setErro(null);
    setEditando(false);
  };

  const salvar = async () => {
    const mudancas = rascunho;

    if (Object.keys(mudancas).length === 0) {
      cancelar();

      return;
    }

    setSalvando(true);
    setErro(null);

    try {
      const nome = pascal(objeto.nameSingular);

      await gql(
        `mutation Atualizar($id: UUID!, $data: ${nome}UpdateInput!) {
           update${nome}(id: $id, data: $data) { id }
         }`,
        { id: registroId, data: mudancas },
      );

      onSalvo(mudancas);
      setRascunho({});
      setEditando(false);
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não conseguimos salvar.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section className="adm-card">
      <header className="adm-card__head">
        <span className="adm-card__title">{titulo}</span>
        {editando ? (
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="adm-btn" onClick={cancelar} disabled={salvando}>
              Cancelar
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--primary"
              onClick={() => void salvar()}
              disabled={salvando}
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </span>
        ) : (
          <button type="button" className="adm-card__edit" onClick={() => setEditando(true)}>
            Editar
          </button>
        )}
      </header>

      <div className="adm-card__body">
        {erro !== null && <div className="adm-error">{erro}</div>}

        <div className={`adm-grid adm-grid--${colunas}`}>
          {visiveis.map((item) => {
            const meta = item.meta as NonNullable<typeof item.meta>;
            const valor = item.nome in rascunho ? rascunho[item.nome] : registro[item.nome];
            const leitura = valorParaLeitura(meta, valor);
            const vazio = leitura === TRACO;

            return (
              <div key={item.nome}>
                <div className="adm-fieldlabel">{item.rotulo ?? meta.label}</div>
                {editando ? (
                  <CampoEditor
                    campo={meta}
                    valor={valor}
                    onChange={(proximo) =>
                      setRascunho((atual) => ({ ...atual, [item.nome]: proximo }))
                    }
                  />
                ) : (
                  <div className={vazio ? 'adm-fieldvalue adm-fieldvalue--empty' : 'adm-fieldvalue'}>
                    {leitura}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {extra}
      </div>
    </section>
  );
};
