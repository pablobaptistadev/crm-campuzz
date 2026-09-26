import { useState } from 'react';

import { type Escopo, carregarEtapasIrmas, ehOpcional, gravarExigencia } from './exigencia';
import { emLotes } from './lotes';

type EtapaComExigencia = {
  id: string;
  name: string;
  escopo: string | null;
  opcional?: boolean | null;
};

const SIMULTANEOS = 6;

type Confirmacao =
  | { fase: 'contando' }
  | { fase: 'pronto'; alvos: string[]; jaEstao: number; total: number }
  | { fase: 'aplicando'; alvos: string[]; feitos: number; falhas: number }
  | { fase: 'fim'; feitos: number; falhas: string[] }
  | { fase: 'erro'; mensagem: string };

// Obrigatória entra no painel de Pendências enquanto não é concluída; opcional
// só aparece lá quando o filtro pede. "Aplicar a todos" leva a mesma escolha
// para essa etapa em todos os clubes (ou membros), uma a uma, para cada uma
// ficar no histórico com quem mudou.
export const ExigenciaDaEtapa = ({
  etapa,
  onMudou,
}: {
  etapa: EtapaComExigencia;
  onMudou: (opcional: boolean) => void;
}) => {
  const opcional = ehOpcional(etapa);
  const escopo: Escopo | null =
    etapa.escopo === 'CLUBE' || etapa.escopo === 'MEMBRO' ? etapa.escopo : null;
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);
  const plural = escopo === 'CLUBE' ? 'clubes' : 'membros';
  const escolha = opcional ? 'opcional' : 'obrigatória';

  const trocar = async (proximo: boolean) => {
    if (proximo === opcional) {
      return;
    }

    setSalvando(true);
    setErro(null);

    try {
      await gravarExigencia(etapa.id, proximo);
      onMudou(proximo);
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não conseguimos salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const abrirAplicarATodos = async () => {
    if (escopo === null) {
      return;
    }

    setConfirmacao({ fase: 'contando' });

    try {
      const irmas = await carregarEtapasIrmas(etapa.name, escopo);
      // Só as que precisam mudar: regravar as que já estão certas encheria o
      // histórico de "mudou de opcional para opcional".
      const alvos = irmas.filter((irma) => ehOpcional(irma) !== opcional).map((irma) => irma.id);

      setConfirmacao({
        fase: 'pronto',
        alvos,
        jaEstao: irmas.length - alvos.length,
        total: irmas.length,
      });
    } catch (causa) {
      setConfirmacao({
        fase: 'erro',
        mensagem: causa instanceof Error ? causa.message : 'Não conseguimos contar as etapas.',
      });
    }
  };

  const aplicar = async (alvos: string[]) => {
    setConfirmacao({ fase: 'aplicando', alvos, feitos: 0, falhas: 0 });

    const resultado = await emLotes(
      alvos,
      SIMULTANEOS,
      (id) => gravarExigencia(id, opcional),
      (feitos, falhas) => setConfirmacao({ fase: 'aplicando', alvos, feitos, falhas }),
    );

    setConfirmacao({ fase: 'fim', feitos: resultado.feitos, falhas: resultado.falhas });
  };

  return (
    <div className="adm-etapa__linha">
      <span className="adm-fieldlabel">Exigência</span>
      <span className="adm-exigencia">
        <span className="adm-segmentado" role="group" aria-label={`Exigência de ${etapa.name}`}>
          <button
            type="button"
            className={opcional ? 'adm-segmentado__opcao' : 'adm-segmentado__opcao adm-segmentado__opcao--on'}
            aria-pressed={!opcional}
            disabled={salvando}
            onClick={() => void trocar(false)}
          >
            Obrigatória
          </button>
          <button
            type="button"
            className={opcional ? 'adm-segmentado__opcao adm-segmentado__opcao--on' : 'adm-segmentado__opcao'}
            aria-pressed={opcional}
            disabled={salvando}
            onClick={() => void trocar(true)}
          >
            Opcional
          </button>
        </span>
        {escopo !== null && (
          <button
            type="button"
            className="adm-link-botao"
            disabled={salvando}
            onClick={() => void abrirAplicarATodos()}
          >
            Aplicar a todos
          </button>
        )}
      </span>
      {erro !== null && <div className="adm-error">{erro}</div>}

      {confirmacao !== null && (
        <div className="adm-modal" role="dialog" aria-label="Aplicar a todos">
          <div className="adm-modal__caixa" style={{ maxWidth: 480 }}>
            <header className="adm-card__head">
              <span className="adm-card__title">Aplicar a todos os {plural}</span>
            </header>
            <div className="adm-card__body">
              {confirmacao.fase === 'contando' && <p>Contando as etapas “{etapa.name}”…</p>}

              {confirmacao.fase === 'erro' && <div className="adm-error">{confirmacao.mensagem}</div>}

              {confirmacao.fase === 'pronto' && (
                <p style={{ lineHeight: 1.6 }}>
                  {confirmacao.alvos.length === 0 ? (
                    <>
                      A etapa “{etapa.name}” já está <strong>{escolha}</strong> nos{' '}
                      {confirmacao.total} {plural}. Nada a mudar.
                    </>
                  ) : (
                    <>
                      Marcar a etapa “{etapa.name}” como <strong>{escolha}</strong> em{' '}
                      <strong>
                        {confirmacao.alvos.length} {confirmacao.alvos.length === 1 ? plural.slice(0, -1) : plural}
                      </strong>
                      {confirmacao.jaEstao > 0 && ` (${confirmacao.jaEstao} já estão assim)`}. Cada
                      mudança fica no histórico da etapa.
                    </>
                  )}
                </p>
              )}

              {confirmacao.fase === 'aplicando' && (
                <p>
                  Aplicando… {confirmacao.feitos + confirmacao.falhas} de {confirmacao.alvos.length}
                </p>
              )}

              {confirmacao.fase === 'fim' && (
                <p style={{ lineHeight: 1.6 }}>
                  {confirmacao.falhas.length === 0
                    ? `Pronto: ${confirmacao.feitos} ${confirmacao.feitos === 1 ? 'etapa atualizada' : 'etapas atualizadas'}.`
                    : `${confirmacao.feitos} atualizadas; ${confirmacao.falhas.length} não conseguimos gravar. Abra de novo para tentar só essas.`}
                </p>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                {confirmacao.fase === 'pronto' && confirmacao.alvos.length > 0 ? (
                  <>
                    <button type="button" className="adm-btn" onClick={() => setConfirmacao(null)}>
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="adm-btn adm-btn--primary"
                      onClick={() => void aplicar(confirmacao.alvos)}
                    >
                      Aplicar em {confirmacao.alvos.length}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="adm-btn"
                    disabled={confirmacao.fase === 'aplicando' || confirmacao.fase === 'contando'}
                    onClick={() => setConfirmacao(null)}
                  >
                    Fechar
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
