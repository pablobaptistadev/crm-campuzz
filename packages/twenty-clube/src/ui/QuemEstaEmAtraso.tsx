import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { MembroComFoto } from 'src/modules/perfil/ui/AvatarDoMembro';
import { type Origem } from './atraso';
import { casaComABusca } from './busca';
import { type Devedor, resumirDevedores } from './devedores';
import { TRACO, dataCurta, dinheiroCurto } from './format';
import { Chip, Vazio } from './primitives';

const ROTULO_DA_ORIGEM: Record<Origem, string> = {
  manual: 'Parcela',
  automatico: 'Financeiro automático',
  marcacao: 'Marcado pela equipe',
};

const reais = (micros: number) => ({ amountMicros: micros, currencyCode: 'BRL' });

const ChipsDeOrigem = ({ devedor }: { devedor: Devedor }) => (
  <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
    {devedor.origens.map((origem) => {
      const quantas = devedor.vencidasPorOrigem[origem];

      return (
        <span key={origem} className={origem === 'marcacao' ? 'adm-chip adm-chip--gold' : 'adm-chip adm-chip--rose'}>
          {ROTULO_DA_ORIGEM[origem]}
          {origem !== 'marcacao' && quantas > 1 ? ` · ${quantas}` : ''}
        </span>
      );
    })}
  </span>
);

export const QuemEstaEmAtraso = ({ devedores }: { devedores: readonly Devedor[] }) => {
  const [origem, setOrigem] = useState<Origem | ''>('');
  const [busca, setBusca] = useState('');
  const resumo = useMemo(() => resumirDevedores(devedores), [devedores]);

  const visiveis = devedores.filter(
    (devedor) =>
      (origem === '' || devedor.origens.includes(origem)) &&
      casaComABusca(busca, [devedor.nome, devedor.clube?.nome]),
  );
  const valorVisivel = visiveis.reduce((soma, devedor) => soma + devedor.valorEmAtraso, 0);

  const kpis: { id: Origem | ''; rotulo: string; valor: number }[] = [
    { id: '', rotulo: 'Pessoas em atraso', valor: resumo.pessoas },
    { id: 'manual', rotulo: 'Por parcela', valor: resumo.pessoasPorOrigem.manual },
    { id: 'automatico', rotulo: 'No financeiro automático', valor: resumo.pessoasPorOrigem.automatico },
    { id: 'marcacao', rotulo: 'Marcados pela equipe', valor: resumo.pessoasPorOrigem.marcacao },
  ];

  return (
    <>
      <p className="adm-painel__ajuda">
        Juntamos as três fontes: parcela lançada à mão, fatura do financeiro automático e a
        marcação de inadimplência que a equipe faz no membro. Basta uma delas vencida para a
        pessoa estar aqui.
      </p>

      <div className="adm-kpis">
        {kpis.map((kpi) => (
          <button
            key={kpi.id || 'todos'}
            type="button"
            className={kpi.id === origem ? 'adm-kpi adm-kpi--on' : 'adm-kpi'}
            onClick={() => setOrigem(kpi.id)}
          >
            <div className="adm-kpi__label">{kpi.rotulo}</div>
            <div className={kpi.valor > 0 ? 'adm-kpi__value adm-kpi__value--rose' : 'adm-kpi__value'}>
              {kpi.valor}
            </div>
          </button>
        ))}
      </div>

      <div className="adm-toolbar" style={{ flexWrap: 'wrap', gap: 12 }}>
        <span className="adm-toolbar__title">
          {visiveis.length} {visiveis.length === 1 ? 'pessoa' : 'pessoas'} ·{' '}
          {valorVisivel > 0 ? `${dinheiroCurto(reais(valorVisivel))} em atraso` : 'valor não informado'}
        </span>
        <input
          className="adm-input"
          style={{ marginLeft: 'auto', minWidth: 0, width: 260, maxWidth: '100%' }}
          placeholder="Buscar por nome ou clube"
          aria-label="Buscar quem está em atraso"
          value={busca}
          onChange={(evento) => setBusca(evento.target.value)}
        />
      </div>

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Quem</th>
              <th>Clube</th>
              <th>Origem</th>
              <th>Em atraso desde</th>
              <th>Valor em atraso</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((devedor) => (
              <tr key={`${devedor.tipo}:${devedor.id}`}>
                <td>
                  <Link
                    className="adm-table__link"
                    to={devedor.tipo === 'membro' ? `/membros/${devedor.id}` : `/clubes/${devedor.id}`}
                  >
                    <MembroComFoto nome={devedor.nome} fotoUrl={devedor.fotoUrl} />
                  </Link>
                  {devedor.tipo === 'clube' && <div className="adm-table__sub">Dívida do clube</div>}
                </td>
                <td>
                  {devedor.clube === null ? (
                    <span className="adm-table__muted">{TRACO}</span>
                  ) : (
                    <Link className="adm-table__link" to={`/clubes/${devedor.clube.id}`}>
                      {devedor.clube.nome}
                    </Link>
                  )}
                </td>
                <td>
                  <ChipsDeOrigem devedor={devedor} />
                </td>
                <td>
                  {devedor.vencidoDesde === null ? (
                    <span className="adm-table__muted">Sem data</span>
                  ) : (
                    <>
                      {dataCurta(devedor.vencidoDesde)}
                      {devedor.diasDeAtraso !== null && devedor.diasDeAtraso > 0 && (
                        <div className="adm-table__sub" style={{ color: 'var(--rose)' }}>
                          {devedor.diasDeAtraso} {devedor.diasDeAtraso === 1 ? 'dia' : 'dias'} em atraso
                        </div>
                      )}
                    </>
                  )}
                </td>
                <td className="adm-table__num">
                  {devedor.valorEmAtraso > 0 ? dinheiroCurto(reais(devedor.valorEmAtraso)) : TRACO}
                </td>
                <td>{devedor.situacao === null ? TRACO : <Chip valor={devedor.situacao} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visiveis.length === 0 && (
          <Vazio>
            {devedores.length === 0
              ? 'Ninguém em atraso. Tudo em dia por aqui.'
              : 'Ninguém em atraso com esse filtro.'}
          </Vazio>
        )}
      </div>
    </>
  );
};
