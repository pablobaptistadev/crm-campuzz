import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { gql } from 'src/api/client';
import { carregarMetadata, type ObjetoMeta } from 'src/api/metadata';
import { ARQUIVAR_CLUBE, ARQUIVAR_SOCIO, MEMBROS_DO_CLUBE_QUERY, montarClubeQuery } from 'src/api/queries';
import { type Etapa, type Socio } from 'src/api/types';
import { Historico } from 'src/ui/Historico';
import { EtapasEmCards, type EtapaCompleta } from 'src/ui/EtapaCard';
import { CardEditavel } from 'src/ui/CardEditavel';
import { Bus } from 'src/ui/Bus';
import { FinanceiroAutomatico } from 'src/ui/FinanceiroAutomatico';
import { CadastroCompleto, type GrupoDeCampos } from 'src/ui/CadastroCompleto';
import { AvatarDoMembro, MembroComFoto } from 'src/modules/perfil/ui/AvatarDoMembro';
import { TrocarFoto } from 'src/modules/perfil/ui/TrocarFoto';
import { NovoMembro } from 'src/ui/NovoMembro';
import { NovoSocio } from 'src/ui/NovoSocio';
import { ChipDeAtraso } from 'src/ui/ChipDeAtraso';
import {
  FILTRO_DE_MEMBRO_VAZIO,
  type FiltroDeMembro,
  filtrarMembros,
  FiltrosDeMembro,
  temFiltroAtivo,
} from 'src/ui/FiltrosDeMembro';
import { paginar } from 'src/ui/paginar';
import { carregarFinanceiroDosMembros } from 'src/ui/financeiroDosMembros';
import { StatusEditavel } from 'src/ui/StatusEditavel';
import { Arquivar } from 'src/ui/Arquivar';
import { AlternarVisao, Campo, Card, Chip, Grid, Secao, Tabs, Vazio, rotuloDe, useModoVisao } from 'src/ui/primitives';
import {
  TRACO,
  dataCurta,
  dinheiro,
  dinheiroCurto,
  enderecoLinha,
  iniciais,
  telefone,
  texto,
} from 'src/ui/format';

type Aba = 'crm' | 'cad' | 'acc' | 'mem' | 'cx' | 'his' | 'cfg';

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'crm', rotulo: 'CRM' },
  { id: 'cad', rotulo: 'Cadastro' },
  { id: 'acc', rotulo: 'Acompanhamento' },
  { id: 'mem', rotulo: 'Membros' },
  { id: 'cx', rotulo: 'Rel. CX' },
  { id: 'his', rotulo: 'Histórico' },
  { id: 'cfg', rotulo: 'Configurações' },
];

// Ordem, não filtro: o que não estiver aqui cai em "Outros campos" e continua
// editável. É o que garante que um campo criado amanhã apareça sozinho.
const GRUPOS_DO_CLUBE: GrupoDeCampos[] = [
  {
    titulo: 'Identificação',
    campos: [
      { nome: 'name', rotulo: 'Nome do clube' },
      'nomeCracha',
      'mentor',
      'responsavel',
      'nicho',
      'situacao',
      'inicio',
      'miniBio',
    ],
  },
  {
    titulo: 'Financeiro',
    campos: [
      { nome: 'capitalNegociado', rotulo: 'Valor total' },
      { nome: 'modeloFinanceiro', rotulo: 'Modelo de pagamento' },
      'linkFastpay',
      'linkCheckout',
    ],
  },
  {
    titulo: 'Contrato e MOU',
    campos: [
      'mouSituacao',
      'mouAssinadoEm',
      'mouValidade',
      'mouLink',
      'origemContrato',
      'contratoMlsAssinado',
      'contratoMlsEm',
      'mlsId',
      'contratoScpAssinado',
      'contratoScpEm',
    ],
  },
  {
    titulo: 'Operação',
    campos: ['kickoffFeito', 'kickoffEm', 'lms', 'bu', 'mlsHouse', 'fastval', 'scpCriada', 'scpCriadaEm', 'grupoWhatsapp'],
  },
  {
    titulo: 'Presentes e preferências',
    campos: ['camiseta', 'calca', 'moletom', 'calcado', 'chocolateFavorito', 'frutaFavorita', 'placaEntregue', 'placaEntregueEm'],
  },
  {
    titulo: 'Contato de emergência',
    campos: ['contatoEmergenciaNome', 'contatoEmergenciaTelefone'],
  },
  { titulo: 'Anotações', campos: ['maiorObjetivo', 'observacoes'] },
];

const sim = (valor: boolean | null) => (valor === true ? 'Sim' : valor === false ? 'Não' : TRACO);

const linkTexto = (valor: { primaryLinkUrl: string | null; primaryLinkLabel: string | null } | null) =>
  valor?.primaryLinkUrl === null || valor?.primaryLinkUrl === undefined ? (
    TRACO
  ) : (
    <a href={valor.primaryLinkUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--gold-deep)' }}>
      {valor.primaryLinkLabel ?? valor.primaryLinkUrl}
    </a>
  );

export const ClubeDetalhe = () => {
  const { id } = useParams<{ id: string }>();
  const navegar = useNavigate();
  const [clube, setClube] = useState<Record<string, any> | null>(null);
  const [metaClube, setMetaClube] = useState<ObjetoMeta | null>(null);
  const [metaSocio, setMetaSocio] = useState<ObjetoMeta | null>(null);
  const [metaMembro, setMetaMembro] = useState<ObjetoMeta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('crm');
  const [adicionandoMembro, setAdicionandoMembro] = useState(false);
  const [metaParcela, setMetaParcela] = useState<ObjetoMeta | null>(null);
  const [adicionandoSocio, setAdicionandoSocio] = useState(false);
  const [modoMembros, setModoMembros] = useModoVisao('membros', 'lista');
  const [membros, setMembros] = useState<any[] | null>(null);
  const [filtro, setFiltro] = useState<FiltroDeMembro>(FILTRO_DE_MEMBRO_VAZIO);
  const [financeiroPronto, setFinanceiroPronto] = useState(false);

  // Uma alteração salva já vale na tela; recarregar o clube inteiro para
  // repintar um campo custaria uma volta ao banco por edição.
  const aplicarParcela = (parcelaId: string, situacao: string) =>
    setClube((atual) =>
      atual === null
        ? atual
        : {
            ...atual,
            parcelas: {
              ...atual.parcelas,
              edges: atual.parcelas.edges.map((aresta: { node: { id: string } }) =>
                aresta.node.id === parcelaId
                  ? { ...aresta, node: { ...aresta.node, situacao } }
                  : aresta,
              ),
            },
          },
    );

  const aplicar = (mudancas: Record<string, unknown>) =>
    setClube((atual) => (atual === null ? atual : { ...atual, ...mudancas }));

  const aplicarEtapa = (proxima: EtapaCompleta) =>
    setClube((atual) =>
      atual === null
        ? atual
        : {
            ...atual,
            jornada: {
              ...atual.jornada,
              edges: atual.jornada.edges.map((aresta: { node: Etapa }) =>
                aresta.node.id === proxima.id
                  ? { ...aresta, node: { ...aresta.node, ...proxima } }
                  : aresta,
              ),
            },
          },
    );

  const aplicarCampoDoMembro =
    (membroId: string, campo: string) => (valor: string) =>
      setMembros((atual) =>
        atual === null
          ? atual
          : atual.map((membro) =>
              membro.id === membroId ? { ...membro, [campo]: valor } : membro,
            ),
      );

  const aplicarMembro = (membroId: string) => (situacao: string) =>
    aplicarCampoDoMembro(membroId, 'situacao')(situacao);

  const aplicarSocio = (socioId: string) => (mudancas: Record<string, unknown>) =>
    setClube((atual) =>
      atual === null
        ? atual
        : {
            ...atual,
            socios: {
              ...atual.socios,
              edges: atual.socios.edges.map((aresta: { node: Socio }) =>
                aresta.node.id === socioId
                  ? { ...aresta, node: { ...aresta.node, ...mudancas } }
                  : aresta,
              ),
            },
          },
    );

  useEffect(() => {
    let cancelado = false;

    void (async () => {
      try {
        // O metadata vem antes porque é ele que diz quais campos pedir: a
        // consulta do clube é montada a partir dele, não escrita à mão.
        const metadata = await carregarMetadata();
        const doClube = metadata.get('clube') ?? null;

        if (doClube === null) {
          throw new Error('Não encontramos o objeto clube neste workspace.');
        }

        // Em paralelo: a lista de membros tem consulta própria e não adianta
        // segurar a tela inteira esperando uma depois da outra.
        const [dados, doClubeMembros] = await Promise.all([
          gql<{ clube: Record<string, any> }>(montarClubeQuery(doClube), { id }),
          paginar<any>(MEMBROS_DO_CLUBE_QUERY, 'membros', { id }),
        ]);

        if (!cancelado) {
          setClube(dados.clube);
          setMembros(doClubeMembros);

          // Depois de a tela abrir, não antes: só o filtro de situação
          // financeira depende disto, e segurar a página inteira esperando
          // parcelas e faturas é o que a deixava 24 s em branco.
          void carregarFinanceiroDosMembros(
            doClubeMembros.map((membro: { id: string }) => membro.id),
          )
            .then((porMembro) => {
              if (cancelado) {
                return;
              }

              setMembros((atual) =>
                atual === null
                  ? atual
                  : atual.map((membro) => ({ ...membro, ...porMembro.get(membro.id) })),
              );
              setFinanceiroPronto(true);
            })
            .catch(() => {
              // Sem o financeiro a lista continua útil; só o filtro de atraso
              // fica indisponível, e ele avisa isso no próprio seletor.
            });
          setMetaClube(doClube);
          setMetaSocio(metadata.get('socio') ?? null);
          setMetaMembro(metadata.get('membro') ?? null);
          setMetaParcela(metadata.get('parcela') ?? null);
        }
      } catch (causa) {
        if (!cancelado) {
          setErro(causa instanceof Error ? causa.message : 'Não conseguimos carregar o clube.');
        }
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [id]);

  if (erro !== null) {
    return <div className="adm-error">{erro}</div>;
  }

  if (clube === null || metaClube === null || metaSocio === null || metaMembro === null || metaParcela === null) {
    return <div className="adm-loading">Carregando…</div>;
  }

  const porOrdem = (a: Etapa, b: Etapa) => (a.ordem ?? 0) - (b.ordem ?? 0);
  const todasEtapas: Etapa[] = clube.jornada.edges.map((aresta: { node: Etapa }) => aresta.node);
  const etapas = todasEtapas.filter((etapa) => (etapa.ordem ?? 0) <= 100).sort(porOrdem);
  const pipeline = todasEtapas.filter((etapa) => (etapa.ordem ?? 0) > 100).sort(porOrdem);
  const socios: Socio[] = clube.socios.edges.map((aresta: { node: Socio }) => aresta.node);
  const parcelas = clube.parcelas.edges.map((aresta: { node: any }) => aresta.node);
  const todosOsMembros = membros ?? [];
  const membrosNaTela = filtrarMembros(todosOsMembros, filtro);

  // "Nenhum membro" e "nenhum que case com o filtro" levam a acoes opostas, e
  // a mesma frase para os dois manda a pessoa cadastrar quem ja esta ali.
  const vazioDosMembros = temFiltroAtivo(filtro)
    ? 'Nenhum membro com esses filtros. Tente limpar a busca.'
    : 'Este clube ainda não tem membros.';

  // A aba conta o clube inteiro; o cabeçalho da lista conta o que está à
  // vista. Enquanto carrega, a aba fica sem número em vez de mostrar zero —
  // um zero ali se lê como "clube sem membros".
  const abas = ABAS.map((item) =>
    item.id === 'mem' && membros !== null
      ? { ...item, contagem: todosOsMembros.length }
      : item,
  );

  return (
    <>
      <div className="adm-crumbs">
        <Link to="/">Dashboard</Link> / {clube.name}
      </div>
      <Link className="adm-back" to="/">
        ← Voltar
      </Link>

      <div className="adm-record">
        <TrocarFoto
          dono="clube"
          vazio="iniciais"
          donoId={clube.id}
          nome={clube.name}
          fotoUrl={clube.fotoUrl ?? null}
          tamanho="titulo"
          onTrocada={(url) => aplicar({ fotoUrl: url })}
        />
        <div>
          <div className="adm-record__name">{clube.name}</div>
          <div className="adm-record__sub">
            {clube.mentor ?? TRACO} · {clube.nicho ?? TRACO}
          </div>
        </div>
        <span className="adm-record__spacer" />
        <div className="adm-record__acoes">
        <ChipDeAtraso
          parcelas={parcelas}
          contratos={clube.contratos}
        />
        <StatusEditavel
          objeto={metaClube}
          registroId={clube.id}
          valor={clube.situacao}
          onSalvo={(proximo) => aplicar({ situacao: proximo })}
          tamanho="titulo"
        />
        <Arquivar
          mutation={ARQUIVAR_CLUBE}
          registroId={clube.id}
          nome={clube.name}
          oQue="clube"
          onArquivado={() => navegar('/')}
        />
        </div>
      </div>

      <Tabs itens={abas} valor={aba} onChange={setAba} />

      {aba === 'crm' && (
        <Card titulo="Jornada do cliente" flush>
          <EtapasEmCards
            etapas={etapas as EtapaCompleta[]}
            onMudou={aplicarEtapa}
            superficie="jornada-clube"
          />
        </Card>
      )}

      {aba === 'cad' && (
        <>
          <CadastroCompleto
            objeto={metaClube}
            registroId={clube.id}
            registro={clube}
            onSalvo={aplicar}
            grupos={GRUPOS_DO_CLUBE}
          />

          <div className="adm-toolbar">
            <span className="adm-toolbar__title">
              {socios.length === 0
                ? 'Sócios'
                : `${socios.length} ${socios.length === 1 ? 'sócio' : 'sócios'}`}
            </span>
            <span className="adm-toolbar__spacer" />
            <button
              type="button"
              className="adm-btn adm-btn--primary"
              onClick={() => setAdicionandoSocio(true)}
            >
              + Adicionar sócio
            </button>
          </div>

          {adicionandoSocio && (
            <NovoSocio
              clubeId={clube.id}
              onFechar={() => setAdicionandoSocio(false)}
              onCriado={(socio) => {
                setAdicionandoSocio(false);
                // Entra na tela sem recarregar o clube inteiro: o registro
                // recém-criado já traz o que o card precisa mostrar.
                setClube((atual) =>
                  atual === null
                    ? atual
                    : {
                        ...atual,
                        socios: {
                          ...atual.socios,
                          edges: [...atual.socios.edges, { node: socio }],
                        },
                      },
                );
              }}
            />
          )}

          {socios.length === 0 ? (
            <Card titulo="Sócios">
              <Vazio>Nenhum sócio cadastrado.</Vazio>
            </Card>
          ) : (
            socios.map((socio) => (
              <div key={socio.id}>
              <CadastroCompleto
                objeto={metaSocio}
                registroId={socio.id}
                registro={socio as unknown as Record<string, unknown>}
                onSalvo={aplicarSocio(socio.id)}
                grupos={[
                  {
                    titulo: socio.papel ?? 'Sócio',
                    campos: [
                      { nome: 'name', rotulo: 'Nome completo' },
                      'papel',
                      'cpf',
                      'rg',
                      'cnpj',
                      'nascimento',
                      'profissao',
                      'estadoCivil',
                      'emails',
                      'telefones',
                      'telefoneFixo',
                      'sexo',
                      'nacionalidade',
                      'naturalidade',
                      'conjuge',
                      'endereco',
                      'instagram',
                      'linkedin',
                      'site',
                    ],
                  },
                ]}
              />
              <div
                className="adm-row-actions"
                style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -8, marginBottom: 16 }}
              >
                <Arquivar
                  mutation={ARQUIVAR_SOCIO}
                  registroId={socio.id}
                  nome={socio.name}
                  oQue="sócio"
                  onArquivado={() =>
                    setClube((atual) =>
                      atual === null
                        ? atual
                        : {
                            ...atual,
                            socios: {
                              ...atual.socios,
                              edges: atual.socios.edges.filter(
                                (aresta: { node: Socio }) => aresta.node.id !== socio.id,
                              ),
                            },
                          },
                    )
                  }
                />
              </div>
            </div>
            ))
          )}
        </>
      )}

      {aba === 'acc' && (
        <>
          <CardEditavel
            titulo="Contrato / MOU"
            objeto={metaClube}
            registroId={clube.id}
            registro={clube}
            onSalvo={aplicar}
            campos={[
              { nome: 'mouSituacao', rotulo: 'Status' },
              { nome: 'mouAssinadoEm', rotulo: 'Data de assinatura' },
              { nome: 'mouValidade', rotulo: 'Válido até' },
              { nome: 'mouLink', rotulo: 'Link do documento' },
              { nome: 'origemContrato', rotulo: 'Origem' },
            ]}
          />

          <CardEditavel
            titulo="Financeiro"
            objeto={metaClube}
            registroId={clube.id}
            registro={clube}
            onSalvo={aplicar}
            campos={[
              { nome: 'capitalNegociado', rotulo: 'Valor total (R$)' },
              { nome: 'modeloFinanceiro', rotulo: 'Modelo de pagamento' },
              { nome: 'inicio', rotulo: 'Data de início' },
              { nome: 'linkFastpay', rotulo: 'Link FastPay' },
              { nome: 'linkCheckout', rotulo: 'Link de checkout' },
            ]}
            extra={
              parcelas.length > 0 ? (
                <>
                  <Secao>Parcelas</Secao>
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>Parcela</th>
                        <th>Valor</th>
                        <th>Vencimento</th>
                        <th>Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parcelas.map((parcela: any) => (
                        <tr key={parcela.id}>
                          <td>{parcela.name}</td>
                          <td className="adm-table__num">{dinheiroCurto(parcela.valor)}</td>
                          <td className="adm-table__muted">{dataCurta(parcela.vencimento)}</td>
                          <td>
                            <StatusEditavel
                              objeto={metaParcela}
                              registroId={parcela.id}
                              valor={parcela.situacao}
                              onSalvo={(proximo) =>
                                aplicarParcela(parcela.id, proximo)
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : undefined
            }
          />

          <FinanceiroAutomatico
            dono="clube"
            donoId={clube.id as string}
            parcelasManuais={parcelas}
          />

          <CardEditavel
            titulo="Contratos"
            objeto={metaClube}
            registroId={clube.id}
            registro={clube}
            onSalvo={aplicar}
            campos={[
              { nome: 'contratoMlsAssinado', rotulo: 'Contrato MLS' },
              { nome: 'contratoMlsEm', rotulo: 'Assinado em' },
              { nome: 'mlsId', rotulo: 'ID MLS (Sankhya)' },
              { nome: 'contratoScpAssinado', rotulo: 'Contrato SCP' },
              { nome: 'contratoScpEm', rotulo: 'Assinado em' },
              { nome: 'kickoffFeito', rotulo: 'Kickoff' },
              { nome: 'kickoffEm', rotulo: 'Kickoff em' },
            ]}
          />

          <Card titulo="Pipeline de etapas" flush>
            <EtapasEmCards
              etapas={pipeline as EtapaCompleta[]}
              onMudou={aplicarEtapa}
              superficie="pipeline-clube"
            />
          </Card>

          <CardEditavel
            titulo="Operacional"
            objeto={metaClube}
            registroId={clube.id}
            registro={clube}
            onSalvo={aplicar}
            campos={[
              { nome: 'lms', rotulo: 'LMS' },
              { nome: 'bu', rotulo: 'BU / Comunidade' },
              { nome: 'responsavel', rotulo: 'Responsável' },
              { nome: 'nicho' },
              { nome: 'mentor' },
              { nome: 'situacao', rotulo: 'Status' },
              { nome: 'grupoWhatsapp', rotulo: 'WhatsApp do clube' },
              { nome: 'mlsHouse', rotulo: 'MLS House' },
              { nome: 'fastval' },
              { nome: 'scpCriada', rotulo: 'SCP criada' },
              { nome: 'scpCriadaEm', rotulo: 'SCP criada em' },
            ]}
          />
        </>
      )}

      {aba === 'mem' && (
        <>
        <div className="adm-toolbar">
          <span className="adm-toolbar__title">
            {membros === null
              ? 'Carregando…'
              : temFiltroAtivo(filtro)
                ? `${membrosNaTela.length} de ${todosOsMembros.length} membros`
                : `${todosOsMembros.length} membros`}
          </span>
          <span className="adm-toolbar__spacer" />
          {metaMembro !== null && (
            <FiltrosDeMembro
              valor={filtro}
              onMudou={setFiltro}
              financeiroPronto={financeiroPronto}
              opcoesDeStatus={metaMembro.campoPorNome.get('situacao')?.options ?? []}
              opcoesDeContrato={
                metaMembro.campoPorNome.get('contratoSituacao')?.options ?? []
              }
            />
          )}
          <AlternarVisao modo={modoMembros} onChange={setModoMembros} />
          <button
            type="button"
            className="adm-btn adm-btn--primary"
            onClick={() => setAdicionandoMembro(true)}
          >
            + Adicionar membro
          </button>
        </div>

        {adicionandoMembro && (
          <NovoMembro
            clubeId={clube.id}
            posicao={todosOsMembros.length + 1}
            onFechar={() => setAdicionandoMembro(false)}
            onCriado={() => {
              setAdicionandoMembro(false);
              window.location.reload();
            }}
          />
        )}

        {modoMembros === 'cards' ? (
          membrosNaTela.length === 0 ? (
            <Vazio>{vazioDosMembros}</Vazio>
          ) : (
            <div className="adm-colecao">
              {membrosNaTela.map((membro: any) => (
                <article className="adm-colecao__card" key={membro.id}>
                  <div className="adm-colecao__topo">
                    <Link to={`/membros/${membro.id}`} style={{ minWidth: 0 }}>
                      <MembroComFoto
                        nome={membro.name}
                        fotoUrl={membro.fotoUrl}
                        tamanho="card"
                        abaixo={rotuloDe(membro.papel)}
                      />
                    </Link>
                    <StatusEditavel
                      objeto={metaMembro}
                      registroId={membro.id}
                      valor={membro.situacao}
                      onSalvo={aplicarMembro(membro.id)}
                    />
                  </div>

                  <div className="adm-colecao__linhas">
                    <div className="adm-colecao__linha">
                      <span className="adm-colecao__rotulo">Contrato</span>
                      <StatusEditavel
                        objeto={metaMembro}
                        registroId={membro.id}
                        campo="contratoSituacao"
                        valor={membro.contratoSituacao}
                        onSalvo={aplicarCampoDoMembro(membro.id, 'contratoSituacao')}
                      />
                    </div>
                    <div className="adm-colecao__linha">
                      <span className="adm-colecao__rotulo">Valor</span>
                      <span className="adm-table__num">{dinheiroCurto(membro.valorTotal)}</span>
                    </div>
                    <div className="adm-colecao__linha">
                      <span className="adm-colecao__rotulo">E-mail</span>
                      <span className="adm-table__muted">
                        {texto(membro.emails?.primaryEmail)}
                      </span>
                    </div>
                    <div className="adm-colecao__linha">
                      <span className="adm-colecao__rotulo">Telefone</span>
                      <span className="adm-table__muted">{telefone(membro.telefones)}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )
        ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Membro</th>
                <th>Papel</th>
                <th>Status</th>
                <th>Contrato</th>
                <th>Valor</th>
                <th>Contato</th>
              </tr>
            </thead>
            <tbody>
              {membrosNaTela.map((membro: any) => (
                <tr key={membro.id}>
                  <td>
                    <Link className="adm-table__link" to={`/membros/${membro.id}`}>
                      <MembroComFoto nome={membro.name} fotoUrl={membro.fotoUrl} />
                    </Link>
                  </td>
                  <td className="adm-table__muted">{rotuloDe(membro.papel)}</td>
                  <td>
                    <StatusEditavel
                      objeto={metaMembro}
                      registroId={membro.id}
                      valor={membro.situacao}
                      onSalvo={aplicarMembro(membro.id)}
                    />
                  </td>
                  <td>
                    <StatusEditavel
                      objeto={metaMembro}
                      registroId={membro.id}
                      campo="contratoSituacao"
                      valor={membro.contratoSituacao}
                      onSalvo={aplicarCampoDoMembro(membro.id, 'contratoSituacao')}
                    />
                  </td>
                  <td className="adm-table__num">{dinheiroCurto(membro.valorTotal)}</td>
                  <td className="adm-table__muted">
                    {texto(membro.emails?.primaryEmail)}
                    <div className="adm-table__sub">{telefone(membro.telefones)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {membrosNaTela.length === 0 && <Vazio>{vazioDosMembros}</Vazio>}
        </div>
        )}
        </>
      )}

      {aba === 'cx' && (
        <CardEditavel
          titulo="Relacionamento"
          objeto={metaClube}
          registroId={clube.id}
          registro={clube}
          onSalvo={aplicar}
          campos={[
            { nome: 'nomeCracha', rotulo: 'Nome no crachá' },
            { nome: 'camiseta' },
            { nome: 'calca', rotulo: 'Calça (nº)' },
            { nome: 'moletom' },
            { nome: 'calcado', rotulo: 'Calçado (nº)' },
            { nome: 'chocolateFavorito', rotulo: 'Chocolate favorito' },
            { nome: 'frutaFavorita', rotulo: 'Fruta favorita' },
            { nome: 'contatoEmergenciaNome', rotulo: 'Contato emergência — Nome' },
            { nome: 'contatoEmergenciaTelefone', rotulo: 'Contato emergência — Telefone' },
            { nome: 'miniBio', rotulo: 'Mini bio' },
            { nome: 'maiorObjetivo', rotulo: 'Maior objetivo no projeto' },
            { nome: 'observacoes', rotulo: 'Observações' },
            { nome: 'placaEntregue', rotulo: 'Placa / reconhecimento' },
            { nome: 'placaEntregueEm', rotulo: 'Placa entregue em' },
          ]}
        />
      )}

      {aba === 'cfg' && (
        <Bus
          dono="clube"
          donoId={clube.id as string}
          businessUnitId={(clube.businessUnit as { id?: string } | null)?.id ?? null}
          onLigada={(businessUnitId) =>
            setClube((atual) =>
              atual === null
                ? atual
                : {
                    ...atual,
                    businessUnit:
                      businessUnitId === null ? null : { id: businessUnitId },
                  },
            )
          }
        />
      )}

      {aba === 'his' && (
        <Card titulo="Histórico" flush>
          <Historico campoAlvo="targetClubeId" alvoId={clube.id} />
        </Card>
      )}
    </>
  );
};
