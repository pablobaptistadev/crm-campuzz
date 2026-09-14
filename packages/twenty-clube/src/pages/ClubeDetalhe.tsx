import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { gql } from 'src/api/client';
import { carregarMetadata, type ObjetoMeta } from 'src/api/metadata';
import { CLUBE_QUERY } from 'src/api/queries';
import { type Etapa, type Socio } from 'src/api/types';
import { Historico } from 'src/ui/Historico';
import { EtapasEmCards, type EtapaCompleta } from 'src/ui/EtapaCard';
import { Jornada } from 'src/ui/Jornada';
import { CardEditavel } from 'src/ui/CardEditavel';
import { Campo, Card, Chip, Grid, Secao, Tabs, Vazio, rotuloDe } from 'src/ui/primitives';
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

type Aba = 'crm' | 'cad' | 'acc' | 'mem' | 'cx' | 'his';

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'crm', rotulo: 'CRM' },
  { id: 'cad', rotulo: 'Cadastro' },
  { id: 'acc', rotulo: 'Acompanhamento' },
  { id: 'mem', rotulo: 'Membros' },
  { id: 'cx', rotulo: 'Rel. CX' },
  { id: 'his', rotulo: 'Histórico' },
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
  const [clube, setClube] = useState<Record<string, any> | null>(null);
  const [metaClube, setMetaClube] = useState<ObjetoMeta | null>(null);
  const [metaSocio, setMetaSocio] = useState<ObjetoMeta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('crm');

  // Uma alteração salva já vale na tela; recarregar o clube inteiro para
  // repintar um campo custaria uma volta ao banco por edição.
  const aplicar = (mudancas: Record<string, unknown>) =>
    setClube((atual) => (atual === null ? atual : { ...atual, ...mudancas }));

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
        const [dados, metadata] = await Promise.all([
          gql<{ clube: Record<string, any> }>(CLUBE_QUERY, { id }),
          carregarMetadata(),
        ]);

        if (!cancelado) {
          setClube(dados.clube);
          setMetaClube(metadata.get('clube') ?? null);
          setMetaSocio(metadata.get('socio') ?? null);
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

  if (clube === null || metaClube === null || metaSocio === null) {
    return <div className="adm-loading">Carregando…</div>;
  }

  const porOrdem = (a: Etapa, b: Etapa) => (a.ordem ?? 0) - (b.ordem ?? 0);
  const todasEtapas: Etapa[] = clube.jornada.edges.map((aresta: { node: Etapa }) => aresta.node);
  const etapas = todasEtapas.filter((etapa) => (etapa.ordem ?? 0) <= 100).sort(porOrdem);
  const pipeline = todasEtapas.filter((etapa) => (etapa.ordem ?? 0) > 100).sort(porOrdem);
  const socios: Socio[] = clube.socios.edges.map((aresta: { node: Socio }) => aresta.node);
  const membros = clube.membros.edges.map((aresta: { node: any }) => aresta.node);
  const parcelas = clube.parcelas.edges.map((aresta: { node: any }) => aresta.node);

  const abas = ABAS.map((item) =>
    item.id === 'mem' ? { ...item, contagem: clube.membros.totalCount } : item,
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
        <span className="adm-record__avatar">{iniciais(clube.name)}</span>
        <div>
          <div className="adm-record__name">{clube.name}</div>
          <div className="adm-record__sub">
            {clube.mentor ?? TRACO} · {clube.nicho ?? TRACO}
          </div>
        </div>
        <span className="adm-record__spacer" />
        <Chip valor={clube.situacao} />
      </div>

      <Tabs itens={abas} valor={aba} onChange={setAba} />

      {aba === 'crm' && (
        <Card titulo="Jornada do cliente" flush>
          <Jornada etapas={etapas} />
        </Card>
      )}

      {aba === 'cad' &&
        (socios.length === 0 ? (
          <Card titulo="Sócios">
            <Vazio>Nenhum sócio cadastrado.</Vazio>
          </Card>
        ) : (
          socios.map((socio) => (
            <CardEditavel
              key={socio.id}
              titulo={socio.papel ?? 'Sócio'}
              objeto={metaSocio}
              registroId={socio.id}
              registro={socio as unknown as Record<string, unknown>}
              onSalvo={aplicarSocio(socio.id)}
              campos={[
                { nome: 'name', rotulo: 'Nome completo' },
                { nome: 'papel' },
                { nome: 'cpf' },
                { nome: 'rg' },
                { nome: 'cnpj' },
                { nome: 'nascimento', rotulo: 'Data de nascimento' },
                { nome: 'profissao', rotulo: 'Profissão' },
                { nome: 'estadoCivil', rotulo: 'Estado civil' },
                { nome: 'emails', rotulo: 'E-mail' },
                { nome: 'telefones', rotulo: 'Celular' },
                { nome: 'telefoneFixo', rotulo: 'Telefone fixo' },
                { nome: 'sexo' },
                { nome: 'nacionalidade' },
                { nome: 'naturalidade' },
                { nome: 'conjuge', rotulo: 'Cônjuge' },
                { nome: 'endereco', rotulo: 'Endereço' },
                { nome: 'instagram' },
                { nome: 'linkedin', rotulo: 'LinkedIn' },
                { nome: 'site' },
              ]}
            />
          ))
        ))}

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
                            <Chip valor={parcela.situacao} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : undefined
            }
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
              onMudou={(proxima) =>
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
                )
              }
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
              {membros.map((membro: any) => (
                <tr key={membro.id}>
                  <td>
                    <Link className="adm-table__link" to={`/membros/${membro.id}`}>
                      {membro.name}
                    </Link>
                  </td>
                  <td className="adm-table__muted">{rotuloDe(membro.papel)}</td>
                  <td>
                    <Chip valor={membro.situacao} />
                  </td>
                  <td>
                    <Chip valor={membro.contratoSituacao} />
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
          {membros.length === 0 && <Vazio>Este clube ainda não tem membros.</Vazio>}
        </div>
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

      {aba === 'his' && (
        <Card titulo="Histórico" flush>
          <Historico
            linhas={clube.timelineActivities.edges.map((aresta: { node: any }) => aresta.node)}
          />
        </Card>
      )}
    </>
  );
};
