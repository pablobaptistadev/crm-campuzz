import { useEffect, useState } from 'react';

import { api } from 'src/api/client';
import { type Bu } from 'src/ui/Bus';
import { dataCurta, dinheiroCurto } from 'src/ui/format';
import { Campo, Grid, Secao } from 'src/ui/primitives';

type Moeda = { amountMicros: number | null; currencyCode: string | null } | null;

type Previa = {
  businessUnit: { id: string; name: string };
  holderEmail: string;
  alreadyLinkedContractId: string | null;
  contract: {
    kind: 'SUBSCRIPTION' | 'TRANSACTION';
    code: string | null;
    status: string;
    amount: Moeda;
    frequency: string | null;
    paymentMethod: string | null;
    nextChargeAt: string | null;
    customer: { name: string | null; email: string | null; document: string | null };
    invoices: { externalInvoiceId: string; status: string; amount: Moeda; dueAt: string | null }[];
  };
};

const entrada = { width: '100%', minWidth: 0 };

export const AdicionarContrato = ({
  dono,
  donoId,
  onFechar,
  onVinculado,
}: {
  dono: 'clube' | 'membro';
  donoId: string;
  onFechar: () => void;
  onVinculado: () => void;
}) => {
  const [identificador, setIdentificador] = useState('');
  const [bus, setBus] = useState<Bu[]>([]);
  const [businessUnitId, setBusinessUnitId] = useState('');
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const carregar = async () => {
      try {
        setBus((await api<{ bus: Bu[] }>('/bus')).bus);
      } catch {
        // Sem a lista, o seletor some e a cascata escolhe a BU sozinha. Isso é
        // pior do que ter o seletor, mas ainda funciona — não vale travar a tela.
        setBus([]);
      }
    };

    void carregar();
  }, []);

  const corpo = () => ({
    [dono === 'clube' ? 'clubeId' : 'membroId']: donoId,
    identifier: identificador.trim(),
    ...(businessUnitId === '' ? {} : { businessUnitId }),
  });

  const buscar = async () => {
    if (identificador.trim() === '') {
      setErro('Informe o número do contrato ou da transação.');

      return;
    }

    setOcupado(true);
    setErro(null);
    setPrevia(null);

    try {
      setPrevia(await api<Previa>('/contrato/preview', corpo()));
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Erro inesperado.');
    } finally {
      setOcupado(false);
    }
  };

  const vincular = async () => {
    setOcupado(true);
    setErro(null);

    try {
      await api('/contrato/vincular', corpo());
      onVinculado();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Erro inesperado.');
    } finally {
      setOcupado(false);
    }
  };

  const contrato = previa?.contract;

  return (
    <div className="adm-modal" role="dialog" aria-label="Adicionar contrato">
      <div className="adm-modal__caixa">
        <header className="adm-card__head">
          <span className="adm-card__title">Adicionar contrato</span>
          <button type="button" className="adm-btn" onClick={onFechar}>
            Fechar
          </button>
        </header>

        <div className="adm-card__body" style={{ display: 'grid', gap: 12 }}>
          {erro !== null && <div className="adm-error">{erro}</div>}

          <label style={{ fontSize: 11, display: 'grid', gap: 4 }}>
            Número do contrato ou da transação
            <input
              style={entrada}
              value={identificador}
              autoFocus
              onChange={(evento) => setIdentificador(evento.target.value)}
              onKeyDown={(evento) => {
                if (evento.key === 'Enter') {
                  void buscar();
                }
              }}
              placeholder="Como aparece no painel da Routerfy"
            />
          </label>

          {bus.length > 1 && (
            <label style={{ fontSize: 11, display: 'grid', gap: 4 }}>
              Procurar em qual BU
              <select
                style={entrada}
                value={businessUnitId}
                onChange={(evento) => setBusinessUnitId(evento.target.value)}
              >
                <option value="">
                  A BU deste {dono} (ou a padrão)
                </option>
                {bus.map((bu) => (
                  <option key={bu.id} value={bu.id}>
                    {bu.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <button
            type="button"
            className="adm-btn"
            disabled={ocupado}
            onClick={() => void buscar()}
          >
            {ocupado && previa === null ? 'Procurando…' : 'Procurar contrato'}
          </button>

          {contrato !== undefined && previa !== null && (
            <>
              <Secao>O que encontramos</Secao>

              <Grid colunas={2}>
                <Campo rotulo="Cliente no gateway" valor={contrato.customer.name} />
                <Campo rotulo="E-mail" valor={contrato.customer.email} />
                <Campo
                  rotulo="Tipo"
                  valor={
                    contrato.kind === 'SUBSCRIPTION' ? 'Recorrência' : 'À vista'
                  }
                />
                <Campo rotulo="Situação no gateway" valor={contrato.status} />
                <Campo rotulo="Valor" valor={dinheiroCurto(contrato.amount)} />
                <Campo
                  rotulo="Parcelas"
                  valor={String(contrato.invoices.length)}
                />
                <Campo
                  rotulo="Próxima cobrança"
                  valor={dataCurta(contrato.nextChargeAt)}
                />
                <Campo rotulo="Forma de pagamento" valor={contrato.paymentMethod} />
                <Campo rotulo="BU usada" valor={previa.businessUnit.name} />
              </Grid>

              {contrato.invoices.length > 0 && (
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Fatura</th>
                      <th>Valor</th>
                      <th>Vencimento</th>
                      <th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contrato.invoices.slice(0, 12).map((fatura) => (
                      <tr key={fatura.externalInvoiceId}>
                        <td>{fatura.externalInvoiceId}</td>
                        <td className="adm-table__num">
                          {dinheiroCurto(fatura.amount)}
                        </td>
                        <td className="adm-table__muted">
                          {dataCurta(fatura.dueAt)}
                        </td>
                        <td>{fatura.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>
                Conferimos o e-mail do contrato contra {previa.holderEmail} antes
                de deixar vincular.
              </p>

              <button
                type="button"
                className="adm-btn adm-btn--primary"
                disabled={ocupado}
                onClick={() => void vincular()}
              >
                {ocupado ? 'Vinculando…' : 'Vincular este contrato'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
