import { useEffect, useRef, useState } from 'react';

import {
  LADO_DA_FOTO,
  type Recorte,
  ZOOM_MAXIMO,
  ZOOM_MINIMO,
  limitarZoom,
  recorteDe,
} from '../dominio/FotoDePerfil';

const LADO_DO_PALCO = 320;

/**
 * Escolha do recorte antes de subir.
 *
 * O palco mostra exatamente o quadrado que vai virar foto: a imagem é
 * posicionada a partir do mesmo `recorteDe` que o canvas usa depois, então o
 * que a pessoa vê é o que sai. Calcular a prévia de um jeito e o corte de
 * outro é como as duas passam a discordar em resoluções diferentes.
 */
export const RecortarFoto = ({
  arquivo,
  redondo = true,
  onCancelar,
  onConfirmar,
}: {
  arquivo: File;
  redondo?: boolean;
  onCancelar: () => void;
  onConfirmar: (recorte: Recorte) => void;
}) => {
  const [endereco, setEndereco] = useState<string | null>(null);
  const [tamanho, setTamanho] = useState<{ largura: number; altura: number } | null>(null);
  const [zoom, setZoom] = useState(ZOOM_MINIMO);
  const [desloc, setDesloc] = useState({ x: 0, y: 0 });
  const arrasto = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(arquivo);

    setEndereco(url);

    // O blob fica preso à aba enquanto a URL existir; sem revogar, trocar de
    // foto dez vezes segura dez imagens inteiras na memória.
    return () => URL.revokeObjectURL(url);
  }, [arquivo]);

  if (endereco === null) {
    return null;
  }

  const recorte =
    tamanho === null
      ? null
      : recorteDe({ ...tamanho, zoom, deslocX: desloc.x, deslocY: desloc.y });

  // Quantos pixels da imagem cabem num pixel do palco. É o que traduz o
  // arrasto do mouse para o deslocamento que o domínio entende.
  const escala = recorte === null ? 1 : LADO_DO_PALCO / recorte.lado;

  const mover = (evento: React.PointerEvent) => {
    if (arrasto.current === null || recorte === null) {
      return;
    }

    const deltaX = (evento.clientX - arrasto.current.x) / escala;
    const deltaY = (evento.clientY - arrasto.current.y) / escala;

    arrasto.current = { x: evento.clientX, y: evento.clientY };
    setDesloc((atual) => ({ x: atual.x - deltaX, y: atual.y - deltaY }));
  };

  return (
    <div className="adm-modal" role="dialog" aria-label="Recortar foto">
      <div className="adm-modal__caixa adm-recorte__caixa">
        <header className="adm-card__head">
          <span className="adm-card__title">Ajustar a foto</span>
          <button type="button" className="adm-btn" onClick={onCancelar}>
            Cancelar
          </button>
        </header>

        <div className="adm-card__body">
          <div
            className={`adm-recorte__palco${redondo ? ' adm-recorte__palco--redondo' : ''}`}
            style={{ width: LADO_DO_PALCO, height: LADO_DO_PALCO }}
            onPointerDown={(evento) => {
              evento.currentTarget.setPointerCapture(evento.pointerId);
              arrasto.current = { x: evento.clientX, y: evento.clientY };
            }}
            onPointerMove={mover}
            onPointerUp={() => {
              arrasto.current = null;
            }}
            onPointerCancel={() => {
              arrasto.current = null;
            }}
          >
            <img
              className="adm-recorte__img"
              src={endereco}
              alt="Foto escolhida"
              draggable={false}
              onLoad={(evento) =>
                setTamanho({
                  largura: evento.currentTarget.naturalWidth,
                  altura: evento.currentTarget.naturalHeight,
                })
              }
              style={
                recorte === null || tamanho === null
                  ? { visibility: 'hidden' }
                  : {
                      width: tamanho.largura * escala,
                      height: tamanho.altura * escala,
                      transform: `translate(${-recorte.origemX * escala}px, ${-recorte.origemY * escala}px)`,
                    }
              }
            />
            <span className="adm-recorte__mascara" aria-hidden="true" />
          </div>

          <label className="adm-recorte__zoom">
            <span className="adm-campo__rotulo">Aproximar</span>
            <input
              type="range"
              className="adm-recorte__range"
              min={ZOOM_MINIMO}
              max={ZOOM_MAXIMO}
              step={0.01}
              value={zoom}
              aria-label="Aproximar"
              onChange={(evento) => setZoom(limitarZoom(Number(evento.target.value)))}
            />
          </label>

          <p className="adm-recorte__dica">
            Arraste para enquadrar. Salvamos em {LADO_DA_FOTO}×{LADO_DA_FOTO} webp.
          </p>

          <div className="adm-campos__acoes">
            <button
              type="button"
              className="adm-btn"
              onClick={() => {
                setZoom(ZOOM_MINIMO);
                setDesloc({ x: 0, y: 0 });
              }}
            >
              Centralizar
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--primary"
              disabled={recorte === null}
              onClick={() => recorte !== null && onConfirmar(recorte)}
            >
              Usar esta foto
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
