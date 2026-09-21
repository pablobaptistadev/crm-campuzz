import { useEffect, useState } from 'react';

import { api } from 'src/api/client';
import { type Bu } from 'src/ui/Bus';
import { dataCurta, dinheiroCurto } from 'src/ui/format';
import { Campo, Chip, Grid, rotuloDe, Secao } from 'src/ui/primitives';

type Moeda = { amountMicros: number | null; currencyCode: string | null } | null;

type Previa = {
  businessUnit: { id: string; name: string };
  holderEmail: string;
  emailConfere: boolean;
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
  const [confirmaTitular, setConfirmaTitular] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const carregar = async () => {
      try {
        const lista = (await api<{ bus: Bu[] }>('/bus')).bus;

        setBus(lista);
        // Já escolhida: com uma BU só e sem marca de padrão, deixar em branco
        // faria a cascata não achar nenhuma e a busca morrer sem a pessoa
        // entender por quê.
        setBusinessUnitId(
          (lista.find((bu) => bu.isDefault) ?? lista[0])?.id ?? '',
        );
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
      setConfirmaTitular(false);
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
      await api('/contrato/vincular', {
        ...corpo(),
        permitirEmailDiferente: confirmaTitular,
      });
      onVinculado();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Erro inesperado.');
    } finally {
      setOcupado(false);
    }
  };

  const contrato = previa?.contract;
  const CANCELADAS = new Set(['canceled', 'cancelled']);
  const validas = (contrato?.invoices ?? []).filter(
    (fatura) => !CANCELADAS.has(fatura.status),
  );
  const canceladas = (contrato?.invoices.length ?? 0) - validas.length;
  const totalEmMicros = validas.reduce(
    (soma, fatura) => soma + (fatura.amount?.amountMicros ?? 0),
    0,
  );

  return (
    <div className="adm-modal" role="dialog" aria-label="Adicionar contrato">
      <div className="adm-modal__caixa">
        <header className="adm-card__head">
          <span className="adm-card__title">Adicionar contrato</span>
          <button type="button" className="adm-btn" onClick={onFechar}>
            Fechar
          </button>
        </header>

        <div className="adm-card__body">
          {erro !== null && <div className="adm-error">{erro}</div>}

          <div className="adm-grid adm-grid--2">
            <div>
              <div className="adm-fieldlabel">Número do contrato ou da transação</div>
              <input
                className="adm-input"
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
            </div>
            <div>
              <div className="adm-fieldlabel">Procurar em qual BU</div>
              <select
                className="adm-input"
                value={businessUnitId}
                onChange={(evento) => setBusinessUnitId(evento.target.value)}
              >
                {bus.map((bu) => (
                  <option key={bu.id} value={bu.id}>
                    {bu.name}
                    {bu.isDefault ? ' (padrão)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>


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
                <Campo
                  rotulo="Situação no gateway"
                  valor={rotuloDe(contrato.status)}
                />
                <Campo
                  rotulo="Valor da parcela"
                  valor={dinheiroCurto(contrato.amount)}
                />
                <Campo
                  rotulo="Parcelas"
                  valor={
                    canceladas === 0
                      ? String(validas.length)
                      : `${validas.length} (${canceladas} cancelada${canceladas > 1 ? 's' : ''})`
                  }
                />
                <Campo
                  rotulo="Total do contrato"
                  valor={dinheiroCurto({
                    amountMicros: totalEmMicros,
                    currencyCode: contrato.amount?.currencyCode ?? 'BRL',
                  })}
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
                    {contrato.invoices.map((fatura) => (
                      <tr key={fatura.externalInvoiceId}>
                        <td>{fatura.externalInvoiceId}</td>
                        <td className="adm-table__num">
                          {dinheiroCurto(fatura.amount)}
                        </td>
                        <td className="adm-table__muted">
                          {dataCurta(fatura.dueAt)}
                        </td>
                        <td>
                          <Chip valor={fatura.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {previa.emailConfere ? (
                <p className="adm-painel__ajuda">
                  O e-mail do contrato bate com o deste registro (
                  {previa.holderEmail}).
                </p>
              ) : (
                <div className="adm-error">
                  <strong>O titular no gateway é outra pessoa.</strong> O contrato
                  está em {contrato.customer.email ?? 'um e-mail não informado'} e
                  este registro é {previa.holderEmail}. Vincular assim amarra a
                  cobrança de alguém na ficha errada — só siga se souber que é
                  esse mesmo (a empresa que paga pelo membro, o cônjuge, o sócio).
                  <label className="adm-fieldlabel">
                    <input
                      type="checkbox"
                      checked={confirmaTitular}
                      onChange={(evento) =>
                        setConfirmaTitular(evento.target.checked)
                      }
                    />{' '}
                    Sei que o titular é diferente e quero vincular mesmo assim
                  </label>
                </div>
              )}

              <button
                type="button"
                className="adm-btn adm-btn--primary"
                disabled={ocupado || (!previa.emailConfere && !confirmaTitular)}
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
