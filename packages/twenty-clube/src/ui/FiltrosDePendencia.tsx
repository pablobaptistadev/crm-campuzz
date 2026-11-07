import {
  type FiltroDePendencia,
  type FiltroDePrazo,
  type OrigemDaPendencia,
  FILTRO_DE_PENDENCIA_VAZIO,
  ROTULO_DA_ORIGEM,
} from './pendenciasDoPainel';

const PRAZOS: { valor: FiltroDePrazo; rotulo: string }[] = [
  { valor: '', rotulo: 'Prazo: todos' },
  { valor: 'vencidas', rotulo: 'Vencidas' },
  { valor: 'semana', rotulo: 'Vencem em 7 dias' },
  { valor: 'semPrazo', rotulo: 'Sem prazo' },
];

const temFiltro = (filtro: FiltroDePendencia) =>
  JSON.stringify(filtro) !== JSON.stringify(FILTRO_DE_PENDENCIA_VAZIO);

export const FiltrosDePendencia = ({
  valor,
  onMudou,
  clubes,
  etapas,
  responsaveis,
}: {
  valor: FiltroDePendencia;
  onMudou: (proximo: FiltroDePendencia) => void;
  clubes: { id: string; nome: string }[];
  etapas: string[];
  responsaveis: string[];
}) => {
  const mudar = (mudancas: Partial<FiltroDePendencia>) => onMudou({ ...valor, ...mudancas });

  return (
    <div className="adm-filtros">
      <input
        className="adm-input adm-filtros__busca"
        type="search"
        placeholder="Buscar por nome, e-mail, clube ou etapa"
        aria-label="Buscar pendências"
        value={valor.busca}
        onChange={(evento) => mudar({ busca: evento.target.value })}
      />
      <select
        className="adm-input"
        aria-label="Origem"
        value={valor.origem}
        onChange={(evento) => mudar({ origem: evento.target.value as OrigemDaPendencia | '' })}
      >
        <option value="">Origem: todas</option>
        {(Object.keys(ROTULO_DA_ORIGEM) as OrigemDaPendencia[]).map((origem) => (
          <option key={origem} value={origem}>
            {ROTULO_DA_ORIGEM[origem]}
          </option>
        ))}
      </select>
      <select
        className="adm-input"
        aria-label="Clube"
        value={valor.clubeId}
        onChange={(evento) => mudar({ clubeId: evento.target.value })}
      >
        <option value="">Clube: todos</option>
        {clubes.map((clube) => (
          <option key={clube.id} value={clube.id}>
            {clube.nome}
          </option>
        ))}
      </select>
      <select
        className="adm-input"
        aria-label="Etapa"
        value={valor.etapa}
        onChange={(evento) => mudar({ etapa: evento.target.value })}
      >
        <option value="">Etapa: todas</option>
        {etapas.map((etapa) => (
          <option key={etapa} value={etapa}>
            {etapa}
          </option>
        ))}
      </select>
      <select
        className="adm-input"
        aria-label="Prazo"
        value={valor.prazo}
        onChange={(evento) => mudar({ prazo: evento.target.value as FiltroDePrazo })}
      >
        {PRAZOS.map((prazo) => (
          <option key={prazo.valor || 'todos'} value={prazo.valor}>
            {prazo.rotulo}
          </option>
        ))}
      </select>
      <select
        className="adm-input"
        aria-label="Responsável"
        value={valor.responsavel}
        onChange={(evento) => mudar({ responsavel: evento.target.value })}
      >
        <option value="">Responsável: todos</option>
        {responsaveis.map((responsavel) => (
          <option key={responsavel} value={responsavel}>
            {responsavel}
          </option>
        ))}
      </select>
      <label className="adm-campo adm-campo--marcar">
        <input
          type="checkbox"
          checked={valor.opcionais}
          onChange={(evento) => mudar({ opcionais: evento.target.checked })}
        />
        <span>Incluir opcionais</span>
      </label>
      <label className="adm-campo adm-campo--marcar">
        <input
          type="checkbox"
          checked={valor.inativos}
          onChange={(evento) => mudar({ inativos: evento.target.checked })}
        />
        <span>Incluir inativos</span>
      </label>
      {temFiltro(valor) && (
        <button type="button" className="adm-link-botao" onClick={() => onMudou(FILTRO_DE_PENDENCIA_VAZIO)}>
          Limpar filtros
        </button>
      )}
    </div>
  );
};
