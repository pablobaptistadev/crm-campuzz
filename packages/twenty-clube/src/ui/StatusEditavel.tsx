import { useState } from 'react';

import { gql } from 'src/api/client';
import { type ObjetoMeta } from 'src/api/metadata';
import { Chip } from './primitives';

const pascal = (nome: string) => nome.charAt(0).toUpperCase() + nome.slice(1);

const Seta = () => (
  <svg
    className="adm-status__seta"
    viewBox="0 0 12 12"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M2.6 4.4 6 7.8l3.4-3.4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// O chip vira select no clique e volta a chip depois de gravar. Um select
// sempre aberto na tabela transformaria a coluna de status numa parede de
// caixas cinzas, e o que importa ali é ler o estado de relance.
export const StatusEditavel = ({
  objeto,
  registroId,
  valor,
  campo = 'situacao',
  tamanho = 'linha',
  onSalvo,
}: {
  objeto: ObjetoMeta;
  registroId: string;
  valor: string | null;
  campo?: string;
  // No cabeçalho o status fica ao lado de um botão e precisa da mesma altura;
  // dentro da tabela ele é uma tag, e uma tag com altura de botão engorda a
  // linha inteira.
  tamanho?: 'linha' | 'titulo';
  onSalvo: (proximo: string) => void;
}) => {
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const meta = objeto.campoPorNome.get(campo);
  const opcoes = meta?.options ?? [];

  if (opcoes.length === 0) {
    return (
      <span className={`adm-status adm-status--${tamanho}`}>
        <Chip valor={valor} />
      </span>
    );
  }

  const salvar = async (proximo: string) => {
    setEditando(false);

    if (proximo === (valor ?? '')) {
      return;
    }

    setSalvando(true);
    // A tela muda antes da resposta: trocar um status e esperar o banco para
    // ver a cor mudar faz a lista parecer travada.
    onSalvo(proximo);

    try {
      const nome = pascal(objeto.nameSingular);

      await gql(
        `mutation TrocarStatus($id: UUID!, $data: ${nome}UpdateInput!) {
           update${nome}(id: $id, data: $data) { id ${campo} }
         }`,
        { id: registroId, data: { [campo]: proximo } },
      );
    } finally {
      setSalvando(false);
    }
  };

  if (!editando) {
    return (
      <button
        type="button"
        className={`adm-status adm-status--${tamanho} adm-status--clicavel`}
        title="Trocar status"
        aria-label={`Status: ${valor ?? 'sem status'}. Clique para trocar.`}
        disabled={salvando}
        onClick={() => setEditando(true)}
      >
        <Chip valor={valor} sufixo={<Seta />} />
      </button>
    );
  }

  return (
    <select
      className={`adm-input adm-status__select adm-status__select--${tamanho}`}
      aria-label="Trocar status"
      autoFocus
      defaultValue={valor ?? ''}
      onBlur={() => setEditando(false)}
      onChange={(evento) => void salvar(evento.target.value)}
    >
      {valor === null && <option value="">—</option>}
      {opcoes.map((opcao) => (
        <option key={opcao.value} value={opcao.value}>
          {opcao.label}
        </option>
      ))}
    </select>
  );
};
