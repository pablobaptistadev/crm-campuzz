// Sem foto não entra inicial nem espaço vazio: entra uma silhueta, desenhada
// aqui em vez de buscada, para não custar uma requisição por linha da tabela.
const SemFoto = ({ titulo }: { titulo: string }) => (
  <svg
    className="adm-avatar__vazio"
    viewBox="0 0 40 40"
    role="img"
    aria-label={titulo}
    focusable="false"
  >
    <circle cx="20" cy="20" r="20" fill="var(--avatar-fundo)" />
    <circle cx="20" cy="15.5" r="6.2" fill="var(--avatar-traco)" />
    <path
      d="M7.4 35.2a12.9 12.9 0 0 1 25.2 0A19.9 19.9 0 0 1 20 40c-4.8 0-9.2-1.7-12.6-4.8Z"
      fill="var(--avatar-traco)"
    />
  </svg>
);

export type TamanhoDoAvatar = 'linha' | 'card' | 'titulo';

export const AvatarDoMembro = ({
  nome,
  fotoUrl,
  tamanho = 'linha',
}: {
  nome: string;
  fotoUrl?: string | null;
  tamanho?: TamanhoDoAvatar;
}) => (
  <span className={`adm-avatar adm-avatar--${tamanho}`}>
    {fotoUrl === null || fotoUrl === undefined || fotoUrl === '' ? (
      <SemFoto titulo={`${nome} — sem foto`} />
    ) : (
      <img className="adm-avatar__img" src={fotoUrl} alt={nome} loading="lazy" />
    )}
  </span>
);

// O nome quase nunca aparece sozinho: na tabela, no card e no cabeçalho ele
// vem colado no avatar, e é essa dupla que se repete.
export const MembroComFoto = ({
  nome,
  fotoUrl,
  tamanho = 'linha',
  abaixo,
}: {
  nome: string;
  fotoUrl?: string | null;
  tamanho?: TamanhoDoAvatar;
  abaixo?: React.ReactNode;
}) => (
  <span className="adm-membro">
    <AvatarDoMembro nome={nome} fotoUrl={fotoUrl} tamanho={tamanho} />
    <span className="adm-membro__texto">
      <span className="adm-membro__nome">{nome}</span>
      {abaixo !== undefined && <span className="adm-membro__sub">{abaixo}</span>}
    </span>
  </span>
);
