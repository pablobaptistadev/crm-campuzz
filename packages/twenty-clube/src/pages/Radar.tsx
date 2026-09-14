import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { RADAR_CLUBES_QUERY, RADAR_QUERY } from 'src/api/queries';
import { Vazio } from 'src/ui/primitives';
import { MembroComFoto } from 'src/modules/perfil/ui/AvatarDoMembro';
import { paginar } from 'src/ui/paginar';
import { TRACO, dataCurta } from 'src/ui/format';

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

type ClubeRadar = {
  id: string;
  name: string;
  inicio: string | null;
  mouValidade: string | null;
  situacao: string | null;
  mentor: string | null;
};

type Evento = {
  chave: string;
  tipo: 'Aniversário' | 'Marco' | 'MOU' | 'Aniversário de casa';
  titulo: string;
  detalhe: string;
  quando: string;
  dias: number;
  link: string;
  presente?: string;
  fotoUrl?: string | null;
};

const hojeZerado = () => {
  const agora = new Date();

  agora.setHours(0, 0, 0, 0);

  return agora;
};

const emDias = (data: Date): number =>
  Math.round((data.getTime() - hojeZerado().getTime()) / 86_400_000);

// Um aniversário se repete: o que importa é a próxima vez que a data cai, não
// o ano em que a pessoa nasceu.
const proximaOcorrencia = (mesDia: string): Date | null => {
  const [, mes, dia] = mesDia.slice(0, 10).split('-').map(Number);

  if (!Number.isFinite(mes) || !Number.isFinite(dia)) {
    return null;
  }

  const hoje = hojeZerado();
  const desteAno = new Date(hoje.getFullYear(), mes - 1, dia);

  return desteAno.getTime() >= hoje.getTime()
    ? desteAno
    : new Date(hoje.getFullYear() + 1, mes - 1, dia);
};

const dataValida = (valor: string | null): boolean => {
  if (valor === null || valor === '') {
    return false;
  }

  const partes = valor.slice(0, 10).split('-').map(Number);

  return partes.length === 3 && partes.every((parte) => Number.isFinite(parte));
};

const MARCOS = [
  { meses: 6, rotulo: '6 meses' },
  { meses: 12, rotulo: '1 ano' },
  { meses: 24, rotulo: '2 anos' },
];

const somarMeses = (base: string, meses: number): Date => {
  const [ano, mes, dia] = base.slice(0, 10).split('-').map(Number);
  const total = mes - 1 + meses;

  return new Date(ano + Math.floor(total / 12), total % 12, dia);
};

const FAIXAS = [
  { id: 'hoje', rotulo: 'Hoje', limite: 0 },
  { id: 'sete', rotulo: '7 dias', limite: 7 },
  { id: 'trinta', rotulo: '30 dias', limite: 30 },
  { id: 'noventa', rotulo: '90 dias', limite: 90 },
  { id: 'todos', rotulo: 'Todos', limite: 366 },
] as const;

type FaixaId = (typeof FAIXAS)[number]['id'];

export const Radar = () => {
  const [membros, setMembros] = useState<MembroRadar[] | null>(null);
  const [clubes, setClubes] = useState<ClubeRadar[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [faixa, setFaixa] = useState<FaixaId>('trinta');

  useEffect(() => {
    void (async () => {
      try {
        const [listaMembros, listaClubes] = await Promise.all([
          paginar<MembroRadar>(RADAR_QUERY, 'membros'),
          paginar<ClubeRadar>(RADAR_CLUBES_QUERY, 'clubes'),
        ]);

        setMembros(listaMembros);
        setClubes(listaClubes);
      } catch (causa) {
        setErro(causa instanceof Error ? causa.message : 'Não conseguimos carregar o radar.');
      }
    })();
  }, []);

  const eventos = useMemo<Evento[]>(() => {
    const saida: Evento[] = [];
    // Buscar o clube dentro de cada membro custaria uma consulta por membro; a
    // lista de clubes já está aqui, então o encontro é local.
    const clubePorId = new Map(clubes.map((clube) => [clube.id, clube]));

    for (const membro of membros ?? []) {
      if (dataValida(membro.nascimento)) {
        const quando = proximaOcorrencia(membro.nascimento as string);

        if (quando !== null) {
          const presente = [
            membro.camiseta !== null ? `camiseta ${membro.camiseta}` : null,
            membro.moletom !== null ? `moletom ${membro.moletom}` : null,
            membro.calca !== null ? `calça ${membro.calca}` : null,
            membro.calcado !== null ? `calçado ${membro.calcado}` : null,
            membro.chocolateFavorito,
            membro.frutaFavorita,
          ]
            .filter((parte) => parte !== null && parte !== '')
            .join(' · ');

          saida.push({
            chave: `nasc-${membro.id}`,
            tipo: 'Aniversário',
            titulo: membro.name,
            detalhe: `${clubePorId.get(membro.clubeId ?? '')?.name ?? 'Sem clube'} · nasceu em ${dataCurta(membro.nascimento)}`,
            quando: quando.toISOString().slice(0, 10),
            dias: emDias(quando),
            link: `/membros/${membro.id}`,
            fotoUrl: membro.fotoUrl,
            presente: presente === '' ? undefined : presente,
          });
        }
      }

      if (dataValida(membro.entradaEm)) {
        const quando = proximaOcorrencia(membro.entradaEm as string);

        if (quando !== null) {
          saida.push({
            chave: `casa-${membro.id}`,
            tipo: 'Aniversário de casa',
            titulo: membro.name,
            detalhe: `${clubePorId.get(membro.clubeId ?? '')?.name ?? 'Sem clube'} · entrou em ${dataCurta(membro.entradaEm)}`,
            quando: quando.toISOString().slice(0, 10),
            dias: emDias(quando),
            link: `/membros/${membro.id}`,
            fotoUrl: membro.fotoUrl,
          });
        }
      }
    }

    for (const clube of clubes) {
      if (dataValida(clube.inicio)) {
        for (const marco of MARCOS) {
          const quando = somarMeses(clube.inicio as string, marco.meses);
          const dias = emDias(quando);

          if (dias >= 0) {
            saida.push({
              chave: `marco-${clube.id}-${marco.meses}`,
              tipo: 'Marco',
              titulo: clube.name,
              detalhe: `${marco.rotulo} de casa · ${clube.mentor ?? TRACO}`,
              quando: quando.toISOString().slice(0, 10),
              dias,
              link: `/clubes/${clube.id}`,
            });
          }
        }
      }

      if (dataValida(clube.mouValidade)) {
        const quando = new Date(`${(clube.mouValidade as string).slice(0, 10)}T00:00:00`);

        saida.push({
          chave: `mou-${clube.id}`,
          tipo: 'MOU',
          titulo: clube.name,
          detalhe: `MOU vence em ${dataCurta(clube.mouValidade)}`,
          quando: (clube.mouValidade as string).slice(0, 10),
          dias: emDias(quando),
          link: `/clubes/${clube.id}`,
        });
      }
    }

    return saida.sort((a, b) => a.dias - b.dias);
  }, [membros, clubes]);

  const contagem = useMemo(
    () =>
      Object.fromEntries(
        FAIXAS.map((item) => [
          item.id,
          eventos.filter((evento) => evento.dias >= 0 && evento.dias <= item.limite).length,
        ]),
      ) as Record<FaixaId, number>,
    [eventos],
  );

  const limite = FAIXAS.find((item) => item.id === faixa)?.limite ?? 30;
  const visiveis = eventos.filter((evento) => evento.dias >= 0 && evento.dias <= limite);
  const aniversarios = visiveis.filter((evento) => evento.tipo === 'Aniversário');
  const outros = visiveis.filter((evento) => evento.tipo !== 'Aniversário');

  if (erro !== null) {
    return <div className="adm-error">{erro}</div>;
  }

  if (membros === null) {
    return <div className="adm-loading">Carregando o radar…</div>;
  }

  const lista = (titulo: string, itens: Evento[]) => (
    <section className="adm-card">
      <header className="adm-card__head">
        <span className="adm-card__title">{titulo}</span>
        <span className="adm-tab__count">{itens.length}</span>
      </header>
      {itens.length === 0 ? (
        <Vazio>Nada nesse período.</Vazio>
      ) : (
        <div>
          {itens.map((evento) => (
            <div className="adm-step" key={evento.chave}>
              <span className="adm-step__label">
                <Link className="adm-table__link" to={evento.link}>
                  {evento.fotoUrl === undefined ? (
                    evento.titulo
                  ) : (
                    <MembroComFoto nome={evento.titulo} fotoUrl={evento.fotoUrl} />
                  )}
                </Link>
                <span className="adm-chip adm-chip--gold" style={{ marginLeft: 8 }}>
                  {evento.tipo}
                </span>
                <span className="adm-table__sub">{evento.detalhe}</span>
                {evento.presente !== undefined && (
                  <span className="adm-table__sub" style={{ color: 'var(--gold-deep)' }}>
                    Presente: {evento.presente}
                  </span>
                )}
              </span>
              <span className="adm-step__state">
                {dataCurta(evento.quando)}
                <div className="adm-table__sub">
                  {evento.dias === 0 ? 'hoje' : `em ${evento.dias} dias`}
                </div>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );

  return (
    <>
      <div className="adm-crumbs">
        <Link to="/">Dashboard</Link> / Radar de Datas
      </div>

      <div className="adm-record">
        <div>
          <div className="adm-record__name">Radar de Datas</div>
          <div className="adm-record__sub">
            Aniversários, marcos e vencimentos de todos os clubes e membros
          </div>
        </div>
      </div>

      <div className="adm-kpis">
        {FAIXAS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === faixa ? 'adm-kpi adm-kpi--on' : 'adm-kpi'}
            onClick={() => setFaixa(item.id)}
          >
            <div className="adm-kpi__label">{item.rotulo}</div>
            <div className="adm-kpi__value">{contagem[item.id]}</div>
          </button>
        ))}
      </div>

      {lista('Aniversários', aniversarios)}
      {lista('Marcos, MOU e tempo de casa', outros)}
    </>
  );
};
