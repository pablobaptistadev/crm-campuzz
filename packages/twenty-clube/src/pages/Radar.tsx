import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  type ClubeDaLista,
  type DependenteDaLista,
  type EtapaDaLista,
  type SocioDaLista,
  carregarClubes,
  carregarDependentes,
  carregarEtapasDoRadar,
  carregarEventosDeEtapa,
  carregarSocios,
} from 'src/api/listas';
import { RADAR_QUERY } from 'src/api/queries';
import { AvatarDoMembro, MembroComFoto } from 'src/modules/perfil/ui/AvatarDoMembro';
import { type Autor, useAutores } from 'src/ui/autores';
import { hojeLocal, somarDias } from 'src/ui/datas';
import { dataCurta } from 'src/ui/format';
import { paginar } from 'src/ui/paginar';
import { Vazio } from 'src/ui/primitives';
import {
  type EventoDoRadar,
  type FaixaDoRadar,
  type GrupoDoTipo,
  GRUPO_DO_TIPO,
  JANELA_DO_PASSADO,
  ROTULO_DO_TIPO,
  autoresDasConclusoes,
  faixaDoEvento,
  montarRadar,
} from 'src/ui/radar';

type MembroRadar = {
  id: string;
  name: string;
  nascimento: string | null;
  entradaEm: string | null;
  papel: string | null;
  situacao: string | null;
  camiseta: string | null;
  calca: string | null;
  moletom: string | null;
  calcado: string | null;
  chocolateFavorito: string | null;
  frutaFavorita: string | null;
  placaEntregue: boolean | null;
  clubeId: string | null;
  fotoUrl: string | null;
};

type Dados = {
  membros: MembroRadar[];
  clubes: ClubeDaLista[];
  socios: SocioDaLista[];
  dependentes: DependenteDaLista[];
  etapas: EtapaDaLista[];
  autorDaConclusao: Map<string, string | null>;
};

const JANELAS = [
  { id: 'hoje', rotulo: 'Hoje', limite: 0 },
  { id: 'sete', rotulo: '7 dias', limite: 7 },
  { id: 'trinta', rotulo: '30 dias', limite: 30 },
  { id: 'noventa', rotulo: '90 dias', limite: 90 },
  { id: 'todos', rotulo: 'Todos', limite: 366 },
] as const;

type JanelaId = (typeof JANELAS)[number]['id'];

const GRUPOS: { id: GrupoDoTipo | ''; rotulo: string }[] = [
  { id: '', rotulo: 'Tudo' },
  { id: 'aniversarios', rotulo: 'Aniversários' },
  { id: 'jornada', rotulo: 'Jornada' },
  { id: 'contrato', rotulo: 'Contrato e MOU' },
  { id: 'marcos', rotulo: 'Marcos' },
];

// Conclusões chegam às centenas quando a equipe atualiza um clube inteiro de
// uma vez; a lista abre nas mais recentes e o resto vem a pedido.
const CONCLUSOES_VISIVEIS = 30;

const nomeDoAutor = (autor: Autor | undefined): string | null => {
  const nome = [autor?.name?.firstName, autor?.name?.lastName]
    .filter((parte) => parte !== null && parte !== undefined && parte.trim() !== '')
    .join(' ')
    .trim();

  return nome === '' ? null : nome;
};

const quandoPorExtenso = (evento: EventoDoRadar): string => {
  if (evento.dias === 0) {
    return 'hoje';
  }

  if (evento.dias > 0) {
    return `em ${evento.dias} ${evento.dias === 1 ? 'dia' : 'dias'}`;
  }

  const dias = Math.abs(evento.dias);
  const ha = `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;

  switch (evento.tipo) {
    case 'prazo':
      return `atrasado ${ha}`;
    case 'mou':
      return `vencido ${ha}`;
    default:
      return ha;
  }
};

export const Radar = () => {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [janela, setJanela] = useState<JanelaId>('trinta');
  const [grupo, setGrupo] = useState<GrupoDoTipo | ''>('');
  const [todasAsConclusoes, setTodasAsConclusoes] = useState(false);
  const autores = useAutores();
  const hoje = hojeLocal();

  useEffect(() => {
    let ativo = true;
    // Um dia a mais que a janela: o evento das 23h de 30 dias atrás é gravado
    // com a hora em UTC, que já é o dia seguinte.
    const desde = somarDias(hoje, -JANELA_DO_PASSADO);

    void (async () => {
      try {
        const [membros, clubes, socios, dependentes, etapas, eventos] = await Promise.all([
          paginar<MembroRadar>(RADAR_QUERY, 'membros'),
          carregarClubes(),
          carregarSocios(),
          carregarDependentes(),
          carregarEtapasDoRadar(desde),
          carregarEventosDeEtapa(somarDias(desde, -1)),
        ]);

        if (ativo) {
          setDados({
            membros,
            clubes,
            socios,
            dependentes,
            etapas,
            autorDaConclusao: autoresDasConclusoes(eventos),
          });
        }
      } catch (causa) {
        if (ativo) {
          setErro(causa instanceof Error ? causa.message : 'Não conseguimos carregar o radar.');
        }
      }
    })();

    return () => {
      ativo = false;
    };
  }, [hoje]);

  const eventos = useMemo(
    () => (dados === null ? [] : montarRadar({ hoje, ...dados })),
    [dados, hoje],
  );

  const limite = JANELAS.find((item) => item.id === janela)?.limite ?? 30;

  const porFaixa = useMemo(() => {
    const saida: Record<FaixaDoRadar, EventoDoRadar[]> = {
      vencidos: [],
      hoje: [],
      proximos: [],
      concluidas: [],
    };

    for (const evento of eventos) {
      const faixa = faixaDoEvento(evento, limite);

      if (faixa !== null && (grupo === '' || GRUPO_DO_TIPO[evento.tipo] === grupo)) {
        saida[faixa].push(evento);
      }
    }

    saida.vencidos.sort((a, b) => a.dias - b.dias);
    saida.hoje.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
    saida.proximos.sort((a, b) => a.dias - b.dias);
    saida.concluidas.sort((a, b) => b.dias - a.dias || a.titulo.localeCompare(b.titulo, 'pt-BR'));

    return saida;
  }, [eventos, limite, grupo]);

  const contagemDaJanela = useMemo(
    () =>
      Object.fromEntries(
        JANELAS.map((item) => [
          item.id,
          eventos.filter(
            (evento) =>
              evento.tipo !== 'conclusao' &&
              evento.dias >= 0 &&
              evento.dias <= item.limite &&
              (grupo === '' || GRUPO_DO_TIPO[evento.tipo] === grupo),
          ).length,
        ]),
      ) as Record<JanelaId, number>,
    [eventos, grupo],
  );

  if (erro !== null) {
    return <div className="adm-error">{erro}</div>;
  }

  if (dados === null) {
    return <div className="adm-loading">Carregando o radar…</div>;
  }

  const linha = (evento: EventoDoRadar) => {
    const autor =
      evento.autorId === undefined || evento.autorId === null ? undefined : autores?.get(evento.autorId);
    const nome = nomeDoAutor(autor);

    return (
      <div className="adm-step" key={evento.chave}>
        <span className="adm-step__label">
          <Link className="adm-table__link" to={evento.link}>
            {evento.fotoUrl === undefined ? (
              evento.titulo
            ) : (
              <MembroComFoto nome={evento.titulo} fotoUrl={evento.fotoUrl} />
            )}
          </Link>
          <span
            className={
              evento.dias < 0 && evento.tipo !== 'conclusao'
                ? 'adm-chip adm-chip--rose'
                : evento.tipo === 'conclusao'
                  ? 'adm-chip adm-chip--green'
                  : 'adm-chip adm-chip--gold'
            }
            style={{ marginLeft: 8 }}
          >
            {ROTULO_DO_TIPO[evento.tipo]}
          </span>
          <span className="adm-table__sub">{evento.detalhe}</span>
          {evento.presente !== undefined && (
            <span className="adm-table__sub" style={{ color: 'var(--gold-deep)' }}>
              Presente: {evento.presente}
            </span>
          )}
        </span>
        <span className="adm-step__autor">
          {evento.tipo === 'conclusao' &&
            (nome === null ? (
              <span className="adm-step__quem adm-step__quem--sem">
                {autores === null && evento.autorId ? '…' : 'Autor não registrado'}
              </span>
            ) : (
              <>
                <AvatarDoMembro nome={nome} fotoUrl={autor?.avatarUrl ?? null} tamanho="linha" vazio="iniciais" />
                <span className="adm-step__quem">{nome}</span>
              </>
            ))}
          <span className="adm-step__state">
            {dataCurta(evento.quando)}
            <div className="adm-table__sub">{quandoPorExtenso(evento)}</div>
          </span>
        </span>
      </div>
    );
  };

  const secao = (titulo: string, ajuda: string, itens: EventoDoRadar[], vazio: string, limitar = false) => {
    const visiveis = limitar && !todasAsConclusoes ? itens.slice(0, CONCLUSOES_VISIVEIS) : itens;

    return (
      <section className="adm-card">
        <header className="adm-card__head">
          <span className="adm-card__title">{titulo}</span>
          <span className="adm-tab__count">{itens.length}</span>
        </header>
        <div className="adm-painel__ajuda" style={{ padding: '10px 20px 0' }}>
          {ajuda}
        </div>
        {itens.length === 0 ? (
          <Vazio>{vazio}</Vazio>
        ) : (
          <div>
            {visiveis.map(linha)}
            {visiveis.length < itens.length && (
              <div style={{ padding: '12px 20px' }}>
                <button type="button" className="adm-btn" onClick={() => setTodasAsConclusoes(true)}>
                  Mostrar todas ({itens.length})
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    );
  };

  const rotuloDaJanela = JANELAS.find((item) => item.id === janela)?.rotulo ?? '30 dias';

  return (
    <>
      <div className="adm-crumbs">
        <Link to="/">Dashboard</Link> / Radar de Datas
      </div>

      <div className="adm-record">
        <div>
          <div className="adm-record__name">Radar de Datas</div>
          <div className="adm-record__sub">
            Aniversários, prazos e conclusões da jornada, MOU e marcos de todos os clubes e membros
          </div>
        </div>
      </div>

      <div className="adm-kpis">
        {JANELAS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === janela ? 'adm-kpi adm-kpi--on' : 'adm-kpi'}
            onClick={() => setJanela(item.id)}
          >
            <div className="adm-kpi__label">{item.rotulo}</div>
            <div className="adm-kpi__value">{contagemDaJanela[item.id]}</div>
          </button>
        ))}
      </div>

      <div className="adm-tabs" role="tablist" style={{ marginBottom: 16 }}>
        {GRUPOS.map((item) => (
          <button
            key={item.id || 'tudo'}
            type="button"
            role="tab"
            aria-selected={item.id === grupo}
            className={item.id === grupo ? 'adm-tab adm-tab--on' : 'adm-tab'}
            onClick={() => setGrupo(item.id)}
          >
            {item.rotulo}
          </button>
        ))}
      </div>

      {porFaixa.vencidos.length > 0 &&
        secao(
          'Vencidos',
          'Prazo da jornada que passou sem a etapa concluída, MOU vencido e marco do último mês.',
          porFaixa.vencidos,
          '',
        )}
      {secao('Hoje', 'O que cai hoje.', porFaixa.hoje, 'Nada para hoje.')}
      {janela !== 'hoje' &&
        secao(
          janela === 'todos' ? 'Próximos 12 meses' : `Próximos ${rotuloDaJanela}`,
          'Aniversários, prazos, MOU a vencer e marcos que vêm aí.',
          porFaixa.proximos,
          'Nada nesse período.',
        )}
      {secao(
        `Concluídas nos últimos ${JANELA_DO_PASSADO} dias`,
        'Etapas da jornada que a equipe marcou como concluídas, com quem marcou.',
        porFaixa.concluidas,
        'Nenhuma etapa concluída no último mês.',
        true,
      )}
    </>
  );
};
