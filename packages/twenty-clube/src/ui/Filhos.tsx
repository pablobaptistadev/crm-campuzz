import { useState } from 'react';

import { gql } from 'src/api/client';
import { dataCurta } from './format';

export type Dependente = {
  id: string;
  name: string;
  parentesco: string | null;
  nascimento: string | null;
  sexo: string | null;
};

const CRIAR = `
  mutation CriarDependente($data: DependenteCreateInput!) {
    createDependente(data: $data) { id name parentesco nascimento sexo }
  }
`;

const ATUALIZAR = `
  mutation AtualizarDependente($id: UUID!, $data: DependenteUpdateInput!) {
    updateDependente(id: $id, data: $data) { id name parentesco nascimento sexo }
  }
`;

const REMOVER = `
  mutation RemoverDependente($id: UUID!) {
    deleteDependente(id: $id) { id }
  }
`;

const PARENTESCOS = ['Filho(a)', 'Enteado(a)', 'Neto(a)', 'Afilhado(a)', 'Outro'];
const SEXOS = [
  { value: '', label: '—' },
  { value: 'F', label: 'Feminino' },
  { value: 'M', label: 'Masculino' },
  { value: 'OUTRO', label: 'Outro' },
];

const vazio = () => ({ name: '', parentesco: PARENTESCOS[0] as string, nascimento: '', sexo: '' });

export const Filhos = ({
  membroId,
  dependentes,
  onMudou,
}: {
  membroId: string;
  dependentes: Dependente[];
  onMudou: (proximos: Dependente[]) => void;
}) => {
  const [editando, setEditando] = useState(false);
  const [novo, setNovo] = useState(vazio());
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const adicionar = async () => {
    if (novo.name.trim() === '') {
      setErro('Precisamos do nome.');

      return;
    }

    setOcupado(true);
    setErro(null);

    try {
      const criado = await gql<{ createDependente: Dependente }>(CRIAR, {
        data: {
          name: novo.name.trim(),
          parentesco: novo.parentesco,
          nascimento: novo.nascimento === '' ? null : novo.nascimento,
          sexo: novo.sexo === '' ? null : novo.sexo,
          membroId,
          position: 'last',
        },
      });

      onMudou([...dependentes, criado.createDependente]);
      setNovo(vazio());
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não conseguimos adicionar.');
    } finally {
      setOcupado(false);
    }
  };

  // Salvar no blur, e só quando algo mudou: sem isso, abrir e fechar a edição
  // de cinco filhos manda cinco gravações que não mudam nada.
  const salvarCampo = async (
    dependente: Dependente,
    campo: keyof Dependente,
    valor: string,
  ) => {
    const proximo = valor === '' ? null : valor;

    if ((dependente[campo] ?? null) === proximo) {
      return;
    }

    onMudou(
      dependentes.map((item) =>
        item.id === dependente.id ? { ...item, [campo]: proximo } : item,
      ),
    );

    await gql(ATUALIZAR, { id: dependente.id, data: { [campo]: proximo } }).catch(
      (causa: unknown) =>
        setErro(causa instanceof Error ? causa.message : 'Não conseguimos salvar.'),
    );
  };

  const remover = async (dependente: Dependente) => {
    setOcupado(true);

    try {
      await gql(REMOVER, { id: dependente.id });
      onMudou(dependentes.filter((item) => item.id !== dependente.id));
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não conseguimos remover.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <>
      <div className="adm-filhos__topo">
        <span className="adm-secao">
          Filhos{dependentes.length > 0 && <span className="adm-filhos__n">{dependentes.length}</span>}
        </span>
        <button
          type="button"
          className="adm-btn adm-btn--pequeno"
          onClick={() => setEditando((atual) => !atual)}
        >
          {editando ? 'Concluir' : dependentes.length === 0 ? '+ Adicionar filho' : 'Editar filhos'}
        </button>
      </div>

      {erro !== null && <div className="adm-error">{erro}</div>}

      {!editando ? (
        dependentes.length === 0 ? (
          <div className="adm-fieldvalue adm-fieldvalue--empty">
            Nenhum filho cadastrado.
          </div>
        ) : (
          <div className="adm-filhos">
            {dependentes.map((dependente) => (
              <div className="adm-filho" key={dependente.id}>
                <span className="adm-filho__nome">{dependente.name}</span>
                <span className="adm-filho__meta">
                  {dependente.parentesco ?? 'Filho(a)'}
                  {dependente.nascimento !== null && ` · ${dataCurta(dependente.nascimento)}`}
                </span>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="adm-filhos__edicao">
          {dependentes.map((dependente) => (
            <div className="adm-filho__linha" key={dependente.id}>
              <input
                className="adm-input"
                aria-label={`Nome de ${dependente.name}`}
                defaultValue={dependente.name}
                onBlur={(evento) => void salvarCampo(dependente, 'name', evento.target.value)}
              />
              <select
                className="adm-input"
                aria-label={`Parentesco de ${dependente.name}`}
                defaultValue={dependente.parentesco ?? PARENTESCOS[0]}
                onChange={(evento) =>
                  void salvarCampo(dependente, 'parentesco', evento.target.value)
                }
              >
                {PARENTESCOS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <input
                className="adm-input"
                type="date"
                aria-label={`Nascimento de ${dependente.name}`}
                defaultValue={dependente.nascimento?.slice(0, 10) ?? ''}
                onBlur={(evento) =>
                  void salvarCampo(dependente, 'nascimento', evento.target.value)
                }
              />
              <select
                className="adm-input"
                aria-label={`Sexo de ${dependente.name}`}
                defaultValue={dependente.sexo ?? ''}
                onChange={(evento) => void salvarCampo(dependente, 'sexo', evento.target.value)}
              >
                {SEXOS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="adm-btn adm-btn--perigo adm-btn--pequeno"
                disabled={ocupado}
                onClick={() => void remover(dependente)}
              >
                Remover
              </button>
            </div>
          ))}

          <div className="adm-filho__linha adm-filho__linha--novo">
            <input
              className="adm-input"
              placeholder="Nome do filho"
              aria-label="Nome do novo filho"
              value={novo.name}
              onChange={(evento) => setNovo((atual) => ({ ...atual, name: evento.target.value }))}
            />
            <select
              className="adm-input"
              aria-label="Parentesco do novo filho"
              value={novo.parentesco}
              onChange={(evento) =>
                setNovo((atual) => ({ ...atual, parentesco: evento.target.value }))
              }
            >
              {PARENTESCOS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <input
              className="adm-input"
              type="date"
              aria-label="Nascimento do novo filho"
              value={novo.nascimento}
              onChange={(evento) =>
                setNovo((atual) => ({ ...atual, nascimento: evento.target.value }))
              }
            />
            <select
              className="adm-input"
              aria-label="Sexo do novo filho"
              value={novo.sexo}
              onChange={(evento) => setNovo((atual) => ({ ...atual, sexo: evento.target.value }))}
            >
              {SEXOS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="adm-btn adm-btn--primary adm-btn--pequeno"
              disabled={ocupado}
              onClick={() => void adicionar()}
            >
              {ocupado ? 'Salvando…' : 'Adicionar'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
