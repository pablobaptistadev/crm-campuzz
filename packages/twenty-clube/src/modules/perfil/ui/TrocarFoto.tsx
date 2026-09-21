import { useRef, useState } from 'react';

import { AvatarDoMembro, type TamanhoDoAvatar } from './AvatarDoMembro';
import { RecortarFoto } from './RecortarFoto';
import { type DonoDaFoto, fotoDe } from '../index';
import { type Recorte } from '../dominio/FotoDePerfil';

/**
 * O botão de foto de qualquer dono — membro, clube ou usuário da conta.
 *
 * Escolher o arquivo não sobe nada: abre o recorte. Subir direto foi o que
 * fazia a foto sair cortada no pescoço, e a pessoa só descobria depois de
 * gravada.
 */
export const TrocarFoto = ({
  dono,
  donoId,
  nome,
  fotoUrl,
  tamanho = 'titulo',
  redondo = true,
  vazio = 'silhueta',
  onTrocada,
}: {
  dono: DonoDaFoto;
  donoId: string;
  nome: string;
  fotoUrl: string | null;
  tamanho?: TamanhoDoAvatar;
  redondo?: boolean;
  vazio?: 'silhueta' | 'iniciais';
  onTrocada: (url: string | null) => void;
}) => {
  const [escolhido, setEscolhido] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const limparEntrada = () => {
    // Sem isto, escolher o mesmo arquivo de novo não dispara o onChange e a
    // tentativa depois de um erro não faz nada.
    if (entrada.current !== null) {
      entrada.current.value = '';
    }
  };

  const subir = async (arquivo: File, recorte: Recorte) => {
    setEscolhido(null);
    setEnviando(true);
    setErro(null);

    try {
      onTrocada(await fotoDe(dono).trocar(donoId, arquivo, recorte));
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não conseguimos subir a foto.');
    } finally {
      setEnviando(false);
      limparEntrada();
    }
  };

  const remover = async () => {
    setEnviando(true);
    setErro(null);

    try {
      await fotoDe(dono).remover(donoId);
      onTrocada(null);
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não conseguimos remover a foto.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="adm-trocarfoto">
      <button
        type="button"
        className="adm-trocarfoto__alvo"
        disabled={enviando}
        title={fotoUrl === null ? 'Subir foto' : 'Trocar foto'}
        onClick={() => entrada.current?.click()}
      >
        <AvatarDoMembro nome={nome} fotoUrl={fotoUrl} tamanho={tamanho} vazio={vazio} />
        <span className="adm-trocarfoto__capa">
          {enviando ? '…' : fotoUrl === null ? 'Subir' : 'Trocar'}
        </span>
      </button>

      {fotoUrl !== null && !enviando && (
        <button
          type="button"
          className="adm-trocarfoto__remover"
          title="Remover foto"
          onClick={() => void remover()}
        >
          Remover
        </button>
      )}

      <input
        ref={entrada}
        type="file"
        accept="image/*"
        hidden
        onChange={(evento) => {
          const arquivo = evento.target.files?.[0];

          if (arquivo !== undefined) {
            setErro(null);
            setEscolhido(arquivo);
          }
        }}
      />

      {escolhido !== null && (
        <RecortarFoto
          arquivo={escolhido}
          redondo={redondo}
          onCancelar={() => {
            setEscolhido(null);
            limparEntrada();
          }}
          onConfirmar={(recorte) => void subir(escolhido, recorte)}
        />
      )}

      {erro !== null && <div className="adm-error">{erro}</div>}
    </div>
  );
};
