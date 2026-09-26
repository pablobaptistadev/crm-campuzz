import { useState } from 'react';

import { gql } from 'src/api/client';
import { AcoesDoFormulario, CampoData, CampoTexto, Campos } from './campos';
import { diasEntre, hojeLocal } from './datas';
import { dataCurta, dinheiroCurto } from './format';
import { micros, numeroLimpo } from './parcelas';
import { Card } from './primitives';

type Moeda = { amountMicros: number | null; currencyCode: string | null } | null;

export type Inadimplencia = {
  inadimplenciaMarcada: boolean | null;
  inadimplenciaValor: Moeda;
  inadimplenciaVencimento: string | null;
};

const ATUALIZAR_MEMBRO = `
  mutation MarcarInadimplencia($id: UUID!, $data: MembroUpdateInput!) {
    updateMembro(id: $id, data: $data) { id }
  }
`;

// Composto vazio é os dois nulos: mandar só `null` o servidor ignora, e o
// valor antigo ficaria gravado depois de desmarcar.
const SEM_VALOR = { amountMicros: null, currencyCode: null };

const valorEmTexto = (valor: Moeda): string =>
  valor?.amountMicros === null || valor?.amountMicros === undefined
    ? ''
    : (Number(valor.amountMicros) / 1_000_000).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

// A dívida que não está em parcela nem no gateway — combinada por fora, por
// exemplo — só existia escrita numa anotação, e o Financeiro não lê anotação.
// Marcada aqui, entra em "Quem está em atraso" junto com as outras.
export const MarcacaoDeInadimplencia = ({
  membroId,
  inadimplencia,
  onSalvo,
}: {
  membroId: string;
  inadimplencia: Inadimplencia;
  onSalvo: (mudancas: Partial<Inadimplencia>) => void;
}) => {
  const marcada = inadimplencia.inadimplenciaMarcada === true;
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState('');
  const [vencimento, setVencimento] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const gravar = async (mudancas: Partial<Inadimplencia>) => {
    setSalvando(true);
    setErro(null);

    try {
      await gql(ATUALIZAR_MEMBRO, { id: membroId, data: mudancas });
      onSalvo(mudancas);
      setEditando(false);
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não conseguimos salvar a marcação.');
    } finally {
      setSalvando(false);
    }
  };

  const abrir = () => {
    setValor(valorEmTexto(inadimplencia.inadimplenciaValor));
    setVencimento(inadimplencia.inadimplenciaVencimento?.slice(0, 10) ?? '');
    setErro(null);
    setEditando(true);
  };

  const salvar = () =>
    void gravar({
      inadimplenciaMarcada: true,
      inadimplenciaValor: valor.trim() === '' ? SEM_VALOR : micros(numeroLimpo(valor)),
      inadimplenciaVencimento: vencimento === '' ? null : vencimento,
    });

  // Desmarcar limpa valor e vencimento: deixá-los gravados faria a próxima
  // marcação nascer com a dívida antiga.
  const desmarcar = () =>
    void gravar({
      inadimplenciaMarcada: false,
      inadimplenciaValor: SEM_VALOR,
      inadimplenciaVencimento: null,
    });

  const vencimentoAtual = inadimplencia.inadimplenciaVencimento;
  const dias = vencimentoAtual === null ? null : diasEntre(vencimentoAtual, hojeLocal());

  return (
    <Card
      titulo="Inadimplência"
      acao={
        marcada && !editando ? (
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="adm-card__edit" onClick={abrir} disabled={salvando}>
              Editar
            </button>
            <button type="button" className="adm-card__edit" onClick={desmarcar} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Desmarcar'}
            </button>
          </span>
        ) : undefined
      }
    >
      {erro !== null && <div className="adm-error">{erro}</div>}

      {editando ? (
        <>
          <Campos colunas={2}>
            <CampoTexto
              rotulo="Valor em aberto (opcional)"
              valor={valor}
              onMudou={setValor}
              placeholder="7.500,00"
              onEnter={salvar}
            />
            <CampoData
              rotulo="Vencimento da dívida (opcional)"
              valor={vencimento}
              onMudou={setVencimento}
            />
          </Campos>
          <AcoesDoFormulario>
            <button
              type="button"
              className="adm-btn"
              onClick={() => setEditando(false)}
              disabled={salvando}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--primary"
              onClick={salvar}
              disabled={salvando}
            >
              {salvando ? 'Salvando…' : marcada ? 'Salvar' : 'Marcar como inadimplente'}
            </button>
          </AcoesDoFormulario>
        </>
      ) : marcada ? (
        <div className="adm-toolbar" style={{ flexWrap: 'wrap', gap: 12 }}>
          <span className="adm-chip adm-chip--rose">Inadimplente</span>
          <span className="adm-toolbar__title">
            {dinheiroCurto(inadimplencia.inadimplenciaValor) === '—'
              ? 'Valor não informado'
              : dinheiroCurto(inadimplencia.inadimplenciaValor)}
          </span>
          <span className="adm-painel__ajuda" style={{ margin: 0 }}>
            {vencimentoAtual === null
              ? 'Sem vencimento informado'
              : `Venceu em ${dataCurta(vencimentoAtual)}${dias !== null && dias > 0 ? ` · ${dias} ${dias === 1 ? 'dia' : 'dias'} em atraso` : ''}`}
          </span>
        </div>
      ) : (
        <div className="adm-toolbar" style={{ flexWrap: 'wrap', gap: 12 }}>
          <span className="adm-painel__ajuda" style={{ margin: 0, flex: 1, minWidth: 220 }}>
            Para a dívida que não está em parcela nem no financeiro automático. Marcado, o
            membro entra em Financeiro › Quem está em atraso.
          </span>
          <button type="button" className="adm-btn" onClick={abrir}>
            Marcar como inadimplente
          </button>
        </div>
      )}
    </Card>
  );
};
