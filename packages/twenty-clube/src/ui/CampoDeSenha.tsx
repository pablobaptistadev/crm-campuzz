import { useState } from 'react';

const OlhoAberto = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M2.06 12.35a1 1 0 0 1 0-.7C3.6 7.8 7.5 5 12 5s8.4 2.8 9.94 6.65a1 1 0 0 1 0 .7C20.4 16.2 16.5 19 12 19s-8.4-2.8-9.94-6.65Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.7" />
    <circle cx="13.1" cy="10.9" r="0.9" fill="currentColor" />
  </svg>
);

const OlhoFechado = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M10.73 5.08A10.4 10.4 0 0 1 12 5c4.5 0 8.4 2.8 9.94 6.65a1 1 0 0 1 0 .7 10.8 10.8 0 0 1-1.67 2.78M6.6 6.6a10.7 10.7 0 0 0-4.54 5.05 1 1 0 0 0 0 .7C3.6 16.2 7.5 19 12 19a10.4 10.4 0 0 0 5.4-1.5"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M9.88 9.88a3.2 3.2 0 0 0 4.24 4.24"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="m3 3 18 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

// Ver o que digitou evita errar a senha no celular, onde o teclado esconde a
// letra no mesmo instante. Volta a esconder a cada tela nova: o estado é do
// campo, não fica guardado em lugar nenhum.
export const CampoDeSenha = ({
  valor,
  onChange,
  autoComplete,
  minLength,
}: {
  valor: string;
  onChange: (valor: string) => void;
  autoComplete: 'current-password' | 'new-password';
  minLength?: number;
}) => {
  const [visivel, setVisivel] = useState(false);

  return (
    <div className="adm-senha">
      <input
        className="adm-input adm-senha__campo"
        type={visivel ? 'text' : 'password'}
        autoComplete={autoComplete}
        // Sem isso o teclado do celular tenta corrigir a senha quando ela fica visível.
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        minLength={minLength}
        required
        value={valor}
        onChange={(evento) => onChange(evento.target.value)}
      />
      <button
        type="button"
        className="adm-senha__olho"
        aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={visivel}
        title={visivel ? 'Ocultar senha' : 'Mostrar senha'}
        onClick={() => setVisivel((atual) => !atual)}
      >
        {visivel ? <OlhoFechado /> : <OlhoAberto />}
      </button>
    </div>
  );
};
