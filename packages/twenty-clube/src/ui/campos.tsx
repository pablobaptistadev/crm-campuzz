import { type ReactNode, useState } from 'react';

// Os campos de formulário moram aqui, e só aqui. Antes cada tela montava o seu
// com label solta e input cru: o select nativo vinha sem borda nem seta, e a
// mesma tela tinha três alturas de campo diferentes. Uma tela nova que precise
// de um campo puxa daqui; se o desenho mudar, muda num lugar.

export const Campos = ({
  colunas = 2,
  children,
}: {
  colunas?: 1 | 2 | 3;
  children: ReactNode;
}) => <div className={`adm-campos adm-campos--${colunas}`}>{children}</div>;

const Rotulo = ({
  rotulo,
  dica,
  children,
}: {
  rotulo: string;
  dica?: string;
  children: ReactNode;
}) => (
  <label className="adm-campo">
    <span className="adm-campo__rotulo">{rotulo}</span>
    {children}
    {dica !== undefined && <span className="adm-campo__dica">{dica}</span>}
  </label>
);

export const CampoTexto = ({
  rotulo,
  valor,
  onMudou,
  dica,
  placeholder,
  segredo = false,
  autoFoco = false,
  onEnter,
}: {
  rotulo: string;
  valor: string;
  onMudou: (valor: string) => void;
  dica?: string;
  placeholder?: string;
  segredo?: boolean;
  autoFoco?: boolean;
  onEnter?: () => void;
}) => (
  <Rotulo rotulo={rotulo} dica={dica}>
    <input
      className="adm-input adm-campo__controle"
      // Chave de gateway não pode ficar legível por cima do ombro nem entrar
      // num screenshot de suporte.
      type={segredo ? 'password' : 'text'}
      autoComplete={segredo ? 'off' : undefined}
      autoFocus={autoFoco}
      value={valor}
      placeholder={placeholder}
      onChange={(evento) => onMudou(evento.target.value)}
      onKeyDown={(evento) => {
        if (evento.key === 'Enter' && onEnter !== undefined) {
          onEnter();
        }
      }}
    />
  </Rotulo>
);

export const CampoSelecao = ({
  rotulo,
  valor,
  opcoes,
  onMudou,
  dica,
}: {
  rotulo: string;
  valor: string;
  opcoes: { valor: string; rotulo: string }[];
  onMudou: (valor: string) => void;
  dica?: string;
}) => (
  <Rotulo rotulo={rotulo} dica={dica}>
    {/* A seta vem da regra global em select.adm-input, que vale para todo
        select do app e não só para este. */}
    <span className="adm-campo__selecao">
      <select
        className="adm-input adm-campo__controle"
        value={valor}
        onChange={(evento) => onMudou(evento.target.value)}
      >
        {opcoes.map((opcao) => (
          <option key={opcao.valor} value={opcao.valor}>
            {opcao.rotulo}
          </option>
        ))}
      </select>
    </span>
  </Rotulo>
);

export const CampoMarcar = ({
  rotulo,
  marcado,
  onMudou,
}: {
  rotulo: string;
  marcado: boolean;
  onMudou: (marcado: boolean) => void;
}) => (
  <label className="adm-campo adm-campo--marcar">
    <input
      type="checkbox"
      checked={marcado}
      onChange={(evento) => onMudou(evento.target.checked)}
    />
    <span>{rotulo}</span>
  </label>
);

export const AcoesDoFormulario = ({ children }: { children: ReactNode }) => (
  <div className="adm-campos__acoes">{children}</div>
);

// Texto que vira campo ao clicar, do jeito que o StatusEditavel já faz com o
// chip. Mora aqui porque o padrão é o mesmo em qualquer célula de tabela que
// precise virar editável, não só nesta.
export const TextoEditavel = ({
  valor,
  aoSalvar,
  vazio = '—',
  placeholder,
}: {
  valor: string | null;
  aoSalvar: (valor: string) => Promise<void>;
  vazio?: string;
  placeholder?: string;
}) => {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(valor ?? '');
  const [salvando, setSalvando] = useState(false);

  const confirmar = async () => {
    if (rascunho === (valor ?? '')) {
      setEditando(false);

      return;
    }

    setSalvando(true);

    try {
      await aoSalvar(rascunho.trim());
      setEditando(false);
    } finally {
      setSalvando(false);
    }
  };

  if (!editando) {
    return (
      <button
        type="button"
        className="adm-editavel"
        onClick={() => {
          setRascunho(valor ?? '');
          setEditando(true);
        }}
      >
        {valor === null || valor === '' ? vazio : valor}
      </button>
    );
  }

  return (
    <input
      className="adm-input adm-campo__controle"
      autoFocus
      disabled={salvando}
      value={rascunho}
      placeholder={placeholder}
      onChange={(evento) => setRascunho(evento.target.value)}
      // Blur confirma em vez de descartar: clicar fora depois de digitar é o
      // gesto de quem terminou, e perder o que escreveu ali irrita sem motivo.
      onBlur={() => void confirmar()}
      onKeyDown={(evento) => {
        if (evento.key === 'Enter') {
          void confirmar();
        }

        if (evento.key === 'Escape') {
          setEditando(false);
        }
      }}
    />
  );
};
