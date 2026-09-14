import { useEffect, useMemo, useState } from 'react';

import { gql } from 'src/api/client';
import {
  CLUBES_SIMPLES_QUERY,
  CRIAR_PARCELAS,
  CRIAR_VENDA,
  MEMBROS_SIMPLES_QUERY,
} from 'src/api/queries';
import { paginar } from './paginar';
import { dataCurta } from './format';

type Clube = { id: string; name: string; situacao: string | null };
type Membro = { id: string; name: string; clubeId: string | null };

const PERIODOS = [
  { value: 'MENSAL', label: 'Mensal', dias: 0, meses: 1 },
  { value: 'QUINZENAL', label: 'Quinzenal', dias: 15, meses: 0 },
  { value: 'SEMANAL', label: 'Semanal', dias: 7, meses: 0 },
  { value: 'ANUAL', label: 'Anual', dias: 0, meses: 12 },
];

// Somar mês em JavaScript estoura o fim do mês: 31/01 + 1 mês vira 03/03. Fixar
// no último dia do mês de destino é o que um boleto faz.
const avancar = (base: string, periodo: string, vezes: number): string => {
  const definicao = PERIODOS.find((item) => item.value === periodo) ?? PERIODOS[0];
  const [ano, mes, dia] = base.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));

  if (definicao.meses > 0) {
    const totalMeses = mes - 1 + definicao.meses * vezes;
    const anoAlvo = ano + Math.floor(totalMeses / 12);
    const mesAlvo = totalMeses % 12;
    const ultimoDia = new Date(Date.UTC(anoAlvo, mesAlvo + 1, 0)).getUTCDate();

    data.setUTCFullYear(anoAlvo, mesAlvo, Math.min(dia, ultimoDia));
  } else {
    data.setUTCDate(data.getUTCDate() + definicao.dias * vezes);
  }

  return data.toISOString().slice(0, 10);
};

const micros = (valor: number) => ({
  amountMicros: Math.round(valor * 1_000_000),
  currencyCode: 'BRL',
});

export const NovaVenda = ({
  onFechar,
  onCriada,
}: {
  onFechar: () => void;
  onCriada: () => void;
}) => {
  const [clubes, setClubes] = useState<Clube[]>([]);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [clubeId, setClubeId] = useState('');
  const [membroId, setMembroId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [valorTotal, setValorTotal] = useState('');
  const [entrada, setEntrada] = useState('');
  const [numeroParcelas, setNumeroParcelas] = useState('12');
  const [primeiroVencimento, setPrimeiroVencimento] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [periodicidade, setPeriodicidade] = useState('MENSAL');
  const [formaPagamento, setFormaPagamento] = useState('');
  const [diasLembrete, setDiasLembrete] = useState('3');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [listaClubes, listaMembros] = await Promise.all([
        paginar<Clube>(CLUBES_SIMPLES_QUERY, 'clubes'),
        paginar<Membro>(MEMBROS_SIMPLES_QUERY, 'membros'),
      ]);

      setClubes(listaClubes.sort((a, b) => a.name.localeCompare(b.name)));
      setMembros(listaMembros.sort((a, b) => a.name.localeCompare(b.name)));
    })();
  }, []);

  const membrosDoClube = useMemo(
    () => (clubeId === '' ? membros : membros.filter((membro) => membro.clubeId === clubeId)),
    [membros, clubeId],
  );

  const numeroLimpo = (bruto: string) => Number(bruto.replace(/\./g, '').replace(',', '.')) || 0;

  const previa = useMemo(() => {
    const quantidade = Math.max(0, Math.min(120, Number(numeroParcelas) || 0));
    const restante = numeroLimpo(valorTotal) - numeroLimpo(entrada);

    if (quantidade === 0 || restante <= 0 || primeiroVencimento === '') {
      return [];
    }

    // O arredondamento vai todo na primeira parcela; assim a soma fecha com o
    // valor do contrato em vez de sobrar centavo.
    const base = Math.floor((restante / quantidade) * 100) / 100;
    const sobra = Math.round((restante - base * quantidade) * 100) / 100;

    return Array.from({ length: quantidade }, (_, indice) => ({
      numero: indice + 1,
      valor: indice === 0 ? Math.round((base + sobra) * 100) / 100 : base,
      vencimento: avancar(primeiroVencimento, periodicidade, indice),
    }));
  }, [valorTotal, entrada, numeroParcelas, primeiroVencimento, periodicidade]);

  const salvar = async () => {
    if (previa.length === 0) {
      setErro('Preencha o valor e o número de parcelas.');

      return;
    }

    setSalvando(true);
    setErro(null);

    try {
      const nome = descricao.trim() === '' ? 'Venda' : descricao.trim();

      const venda = await gql<{ createVenda: { id: string } }>(CRIAR_VENDA, {
        data: {
          name: nome,
          valorTotal: micros(numeroLimpo(valorTotal)),
          entrada: numeroLimpo(entrada) > 0 ? micros(numeroLimpo(entrada)) : null,
          numeroParcelas: previa.length,
          primeiroVencimento,
          periodicidade,
          formaPagamento: formaPagamento.trim() === '' ? null : formaPagamento.trim(),
          situacao: 'ABERTA',
          fechadaEm: new Date().toISOString().slice(0, 10),
          clubeId: clubeId === '' ? null : clubeId,
          membroId: membroId === '' ? null : membroId,
          position: 'last',
        },
      });

      const antecedencia = Math.max(0, Number(diasLembrete) || 0);

      await gql(CRIAR_PARCELAS, {
        data: previa.map((parcela) => ({
          name: `${nome} — parcela ${parcela.numero}/${previa.length}`,
          numero: parcela.numero,
          valor: micros(parcela.valor),
          vencimento: parcela.vencimento,
          lembreteEm: avancar(parcela.vencimento, 'SEMANAL', 0) && antecedencia > 0
            ? new Date(
                new Date(`${parcela.vencimento}T00:00:00Z`).getTime() -
                  antecedencia * 86_400_000,
              )
                .toISOString()
                .slice(0, 10)
            : parcela.vencimento,
          situacao: 'PENDENTE',
          formaPagamento: formaPagamento.trim() === '' ? null : formaPagamento.trim(),
          vendaId: venda.createVenda.id,
          clubeId: clubeId === '' ? null : clubeId,
          membroId: membroId === '' ? null : membroId,
          position: parcela.numero,
        })),
      });

      onCriada();
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não conseguimos criar a venda.');
    } finally {
      setSalvando(false);
    }
  };

  const soma = previa.reduce((total, parcela) => total + parcela.valor, 0);

  return (
    <div className="adm-modal" role="dialog" aria-label="Nova venda">
      <div className="adm-modal__caixa">
        <header className="adm-card__head">
          <span className="adm-card__title">Nova venda</span>
          <button type="button" className="adm-btn" onClick={onFechar}>
            Fechar
          </button>
        </header>

        <div className="adm-card__body">
          {erro !== null && <div className="adm-error">{erro}</div>}

          <div className="adm-grid adm-grid--2">
            <div>
              <div className="adm-fieldlabel">Clube</div>
              <select
                className="adm-input"
                style={{ width: '100%', minWidth: 0 }}
                value={clubeId}
                onChange={(evento) => {
                  setClubeId(evento.target.value);
                  setMembroId('');
                }}
              >
                <option value="">—</option>
                {clubes.map((clube) => (
                  <option key={clube.id} value={clube.id}>
                    {clube.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="adm-fieldlabel">Membro</div>
              <select
                className="adm-input"
                style={{ width: '100%', minWidth: 0 }}
                value={membroId}
                onChange={(evento) => setMembroId(evento.target.value)}
              >
                <option value="">—</option>
                {membrosDoClube.map((membro) => (
                  <option key={membro.id} value={membro.id}>
                    {membro.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="adm-grid adm-grid--2" style={{ marginTop: 14 }}>
            <div>
              <div className="adm-fieldlabel">Descrição</div>
              <input
                className="adm-input"
                style={{ width: '100%', minWidth: 0 }}
                placeholder="Mentoria 12 meses"
                value={descricao}
                onChange={(evento) => setDescricao(evento.target.value)}
              />
            </div>
            <div>
              <div className="adm-fieldlabel">Forma de pagamento</div>
              <input
                className="adm-input"
                style={{ width: '100%', minWidth: 0 }}
                placeholder="Cartão, pix, boleto…"
                value={formaPagamento}
                onChange={(evento) => setFormaPagamento(evento.target.value)}
              />
            </div>
          </div>

          <div className="adm-grid adm-grid--3" style={{ marginTop: 14 }}>
            <div>
              <div className="adm-fieldlabel">Valor total (R$)</div>
              <input
                className="adm-input"
                style={{ width: '100%', minWidth: 0 }}
                inputMode="decimal"
                value={valorTotal}
                onChange={(evento) => setValorTotal(evento.target.value)}
              />
            </div>
            <div>
              <div className="adm-fieldlabel">Entrada (R$)</div>
              <input
                className="adm-input"
                style={{ width: '100%', minWidth: 0 }}
                inputMode="decimal"
                value={entrada}
                onChange={(evento) => setEntrada(evento.target.value)}
              />
            </div>
            <div>
              <div className="adm-fieldlabel">Nº de parcelas</div>
              <input
                className="adm-input"
                style={{ width: '100%', minWidth: 0 }}
                inputMode="numeric"
                value={numeroParcelas}
                onChange={(evento) => setNumeroParcelas(evento.target.value)}
              />
            </div>
          </div>

          <div className="adm-grid adm-grid--3" style={{ marginTop: 14 }}>
            <div>
              <div className="adm-fieldlabel">1º vencimento</div>
              <input
                className="adm-input"
                style={{ width: '100%', minWidth: 0 }}
                type="date"
                value={primeiroVencimento}
                onChange={(evento) => setPrimeiroVencimento(evento.target.value)}
              />
            </div>
            <div>
              <div className="adm-fieldlabel">Periodicidade</div>
              <select
                className="adm-input"
                style={{ width: '100%', minWidth: 0 }}
                value={periodicidade}
                onChange={(evento) => setPeriodicidade(evento.target.value)}
              >
                {PERIODOS.map((periodo) => (
                  <option key={periodo.value} value={periodo.value}>
                    {periodo.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="adm-fieldlabel">Lembrar quantos dias antes</div>
              <input
                className="adm-input"
                style={{ width: '100%', minWidth: 0 }}
                inputMode="numeric"
                value={diasLembrete}
                onChange={(evento) => setDiasLembrete(evento.target.value)}
              />
            </div>
          </div>

          {previa.length > 0 && (
            <>
              <div className="adm-section">
                Prévia — {previa.length} parcelas, somando R${' '}
                {soma.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Vencimento</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previa.map((parcela) => (
                      <tr key={parcela.numero}>
                        <td className="adm-table__num">{parcela.numero}</td>
                        <td>{dataCurta(parcela.vencimento)}</td>
                        <td className="adm-table__num">
                          R$ {parcela.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
            <button type="button" className="adm-btn" onClick={onFechar} disabled={salvando}>
              Cancelar
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--primary"
              onClick={() => void salvar()}
              disabled={salvando || previa.length === 0}
            >
              {salvando ? 'Criando…' : `Criar venda e ${previa.length} parcelas`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
