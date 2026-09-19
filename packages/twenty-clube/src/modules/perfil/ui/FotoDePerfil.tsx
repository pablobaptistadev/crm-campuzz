import { useRef, useState } from 'react';

import { LADO_DA_FOTO } from '../dominio/FotoDePerfil';
import { perfilDoMembro } from '../index';

export const FotoDePerfil = ({
  membroId,
  nome,
  fotoUrl,
  onTrocada,
}: {
  membroId: string;
  nome: string;
  fotoUrl: string | null;
  onTrocada: (url: string | null) => void;
}) => {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const iniciais = nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? '')
    .join('');

  const trocar = async (arquivo: File) => {
    setEnviando(true);
    setErro(null);

    try {
      onTrocada(await perfilDoMembro.trocarFoto(membroId, arquivo));
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não conseguimos subir a foto.');
    } finally {
      setEnviando(false);

      // Sem isto, escolher o mesmo arquivo de novo não dispara o onChange e a
      // tentativa depois de um erro não faz nada.
      if (entrada.current !== null) {
        entrada.current.value = '';
      }
    }
  };

  const remover = async () => {
    setEnviando(true);
    setErro(null);

    try {
      await perfilDoMembro.removerFoto(membroId);
      onTrocada(null);
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não conseguimos remover a foto.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="adm-foto">
      <div className="adm-foto__moldura">
        {fotoUrl === null ? (
          <span className="adm-foto__iniciais">{iniciais || '—'}</span>
        ) : (
          <img
            className="adm-foto__img"
            src={fotoUrl}
            alt={`Foto de ${nome}`}
            width={LADO_DA_FOTO}
            height={LADO_DA_FOTO}
          />
        )}
      </div>

      <div className="adm-foto__acoes">
        <input
          id={`foto-${membroId}`}
          ref={entrada}
          type="file"
          accept="image/*"
          hidden
          onChange={(evento) => {
            const arquivo = evento.target.files?.[0];

            if (arquivo !== undefined) {
              void trocar(arquivo);
            }
          }}
        />
        <button
          type="button"
          className="adm-btn"
          disabled={enviando}
          onClick={() => entrada.current?.click()}
        >
          {enviando ? 'Enviando…' : fotoUrl === null ? 'Subir foto' : 'Trocar foto'}
        </button>
        {fotoUrl !== null && !enviando && (
          <button type="button" className="adm-btn adm-btn--perigo" onClick={() => void remover()}>
            Remover
          </button>
        )}
        <div className="adm-foto__dica">
          Recortamos no centro e salvamos em {LADO_DA_FOTO}×{LADO_DA_FOTO} webp.
        </div>
        {erro !== null && <div className="adm-error">{erro}</div>}
      </div>
    </div>
  );
};
