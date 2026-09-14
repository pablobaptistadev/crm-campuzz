import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { gql } from 'src/api/client';
import { carregarMetadata, type ObjetoMeta } from 'src/api/metadata';
import { ARQUIVAR_MEMBRO, MEMBRO_QUERY } from 'src/api/queries';
import { type Etapa } from 'src/api/types';
import { Historico } from 'src/ui/Historico';
import { EtapasEmCards, type EtapaCompleta } from 'src/ui/EtapaCard';
import { CardEditavel } from 'src/ui/CardEditavel';
import { NovaVenda } from 'src/ui/NovaVenda';
import { Arquivar } from 'src/ui/Arquivar';
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

type Aba = 'crm' | 'cad' | 'acc' | 'cx' | 'his';

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'crm', rotulo: 'CRM' },
  { id: 'cad', rotulo: 'Cadastro' },
  { id: 'acc', rotulo: 'Acompanhamento' },
  { id: 'cx', rotulo: 'Rel. CX' },
  { id: 'his', rotulo: 'Histórico' },
];

const linkTexto = (valor: { primaryLinkUrl: string | null; primaryLinkLabel: string | null } | null) =>
  valor?.primaryLinkUrl === null || valor?.primaryLinkUrl === undefined ? (
    TRACO
  ) : (
    <a href={valor.primaryLinkUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--gold-deep)' }}>
      {valor.primaryLinkLabel ?? valor.primaryLinkUrl}
    </a>
  );

const SEXO: Record<string, string> = { F: 'Feminino', M: 'Masculino', OUTRO: 'Outro' };

export const MembroDetalhe = () => {
  const { id } = useParams<{ id: string }>();
  const navegar = useNavigate();
  const [membro, setMembro] = useState<Record<string, any> | null>(null);
  const [objeto, setObjeto] = useState<ObjetoMeta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('crm');
  const [abrindoVenda, setAbrindoVenda] = useState(false);

  // Uma alteração salva já vale na tela; recarregar o registro inteiro para
  // repintar um campo custaria uma volta ao banco por edição.
  const aplicar = (mudancas: Record<string, unknown>) =>
    setMembro((atual) => (atual === null ? atual : { ...atual, ...mudancas }));

  useEffect(() => {
    let cancelado = false;

    void (async () => {
      try {
        const [dados, metadata] = await Promise.all([
          gql<{ membro: Record<string, any> }>(MEMBRO_QUERY, { id }),
          carregarMetadata(),
        ]);

        if (!cancelado) {
          setMembro(dados.membro);
          setObjeto(metadata.get('membro') ?? null);
        }
      } catch (causa) {
        if (!cancelado) {
          setErro(causa instanceof Error ? causa.message : 'Não conseguimos carregar o membro.');
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

  if (membro === null || objeto === null) {
    return <div className="adm-loading">Carregando…</div>;
  }

  const etapas: Etapa[] = membro.jornada.edges
    .map((aresta: { node: Etapa }) => aresta.node)
    .sort((a: Etapa, b: Etapa) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const parcelas = membro.parcelas.edges.map((aresta: { node: any }) => aresta.node);
  const dependentes = membro.dependentes.edges.map((aresta: { node: any }) => aresta.node);
  const pendencias = membro.pendencias.edges.map((aresta: { node: any }) => aresta.node);
  const clube = membro.clube;

  return (
    <>
      <div className="adm-crumbs">
        <Link to="/">Dashboard</Link>
        {clube !== null && (
          <>
            {' / '}
            <Link to={`/clubes/${clube.id}`}>{clube.name}</Link>
          </>
        )}
        {' / '}
        {membro.name}
      </div>
      {clube !== null && (
        <Link className="adm-back" to={`/clubes/${clube.id}`}>
          ← Voltar para {clube.name}
        </Link>
      )}

      <div className="adm-record">
        <span className="adm-record__avatar">{iniciais(membro.name)}</span>
        <div>
          <div className="adm-record__name">{membro.name}</div>
          <div className="adm-record__sub">{clube?.name ?? TRACO}</div>
        </div>
        <span className="adm-record__spacer" />
        <Chip valor={membro.situacao} />
        <Arquivar
          mutation={ARQUIVAR_MEMBRO}
          registroId={membro.id}
          nome={membro.name}
          oQue="membro"
          onArquivado={() => navegar(clube === null ? '/' : `/clubes/${clube.id}`)}
        />
      </div>

      <Tabs itens={ABAS} valor={aba} onChange={setAba} />

      {aba === 'crm' && (
        <Card titulo="Jornada do membro" flush>
          <EtapasEmCards
            etapas={etapas as EtapaCompleta[]}
            onMudou={(proxima) =>
              setMembro((atual) =>
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
            superficie="jornada-membro"
          />
        </Card>
      )}

      {aba === 'cad' && (
        <CardEditavel
          titulo={rotuloDe(membro.papel)}
          objeto={objeto}
          registroId={membro.id}
          registro={membro}
          onSalvo={aplicar}
          campos={[
            { nome: 'name', rotulo: 'Nome completo' },
            { nome: 'cpf' },
            { nome: 'rg' },
            { nome: 'nascimento', rotulo: 'Data de nascimento' },
            { nome: 'profissao', rotulo: 'Profissão' },
            { nome: 'estadoCivil', rotulo: 'Estado civil' },
            { nome: 'emails', rotulo: 'E-mail' },
            { nome: 'telefones', rotulo: 'Celular' },
            { nome: 'telefoneFixo', rotulo: 'Telefone fixo' },
            { nome: 'sexo' },
            { nome: 'nacionalidade' },
            { nome: 'naturalidade' },
            { nome: 'cnpj' },
            { nome: 'conjuge', rotulo: 'Cônjuge' },
            { nome: 'papel' },
            { nome: 'situacao', rotulo: 'Status' },
            { nome: 'entradaEm', rotulo: 'Entrou em' },
            { nome: 'endereco', rotulo: 'Endereço' },
            { nome: 'instagram' },
            { nome: 'linkedin', rotulo: 'LinkedIn' },
            { nome: 'site' },
          ]}
        />
      )}

      {aba === 'acc' && (
        <>
          <CardEditavel
            titulo="Contrato"
            objeto={objeto}
            registroId={membro.id}
            registro={membro}
            onSalvo={aplicar}
            campos={[
              { nome: 'contratoNumero', rotulo: 'Número do contrato' },
              { nome: 'contratoSituacao', rotulo: 'Status' },
              { nome: 'contratoAssinadoEm', rotulo: 'Data assinatura' },
              { nome: 'contratoLink', rotulo: 'Link do contrato' },
              { nome: 'entradaEm', rotulo: 'Entrou em' },
            ]}
          />

          {abrindoVenda && (
            <NovaVenda
              clubeFixo={clube === null ? undefined : { id: clube.id, name: clube.name }}
              membroFixo={{ id: membro.id, name: membro.name }}
              onFechar={() => setAbrindoVenda(false)}
              onCriada={() => {
                setAbrindoVenda(false);
                window.location.reload();
              }}
            />
          )}

          <CardEditavel
            titulo="Financeiro"
            objeto={objeto}
            registroId={membro.id}
            registro={membro}
            onSalvo={aplicar}
            campos={[
              { nome: 'valorTotal', rotulo: 'Valor total (R$)' },
              { nome: 'modeloPagamento', rotulo: 'Modelo de pagamento' },
              { nome: 'linkFastpay', rotulo: 'Link pagamento (FastPay)' },
            ]}
            extra={
              <>
                <div className="adm-toolbar" style={{ marginTop: 16, marginBottom: 0 }}>
                  <span className="adm-toolbar__title">
                    {parcelas.length} parcelas
                  </span>
                  <span className="adm-toolbar__spacer" />
                  <button
                    type="button"
                    className="adm-btn adm-btn--primary"
                    onClick={() => setAbrindoVenda(true)}
                  >
                    + Nova venda
                  </button>
                </div>
                {parcelas.length > 0 && (
                <>
                  <Secao>Parcelas</Secao>
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th>Parcela</th>
                        <th>Valor</th>
                        <th>Vencimento</th>
                        <th>Situação</th>
                        <th>Paga em</th>
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
                          <td className="adm-table__muted">{dataCurta(parcela.pagaEm)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
                )}
              </>
            }
          />

          <Card titulo="Pendências" flush>
            {pendencias.length === 0 ? (
              <Vazio>Nenhuma pendência aberta.</Vazio>
            ) : (
              <div>
                {pendencias.map((pendencia: any) => (
                  <div className="adm-step" key={pendencia.id}>
                    <span className="adm-step__label">
                      {pendencia.descricao ?? pendencia.name}
                      {pendencia.prazo !== null && (
                        <span className="adm-table__sub">Prazo: {dataCurta(pendencia.prazo)}</span>
                      )}
                    </span>
                    <Chip valor={pendencia.situacao} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {aba === 'cx' && (
        <CardEditavel
          titulo="Relacionamento"
          objeto={objeto}
          registroId={membro.id}
          registro={membro}
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
          extra={
            <>
              <Secao>Filhos</Secao>
              {dependentes.length === 0 ? (
                <div className="adm-fieldvalue adm-fieldvalue--empty">{TRACO}</div>
              ) : (
                <Grid colunas={3}>
                  {dependentes.map((dependente: any) => (
                    <Campo
                      key={dependente.id}
                      rotulo={dependente.parentesco ?? 'Filho(a)'}
                      valor={`${dependente.name}${dependente.nascimento !== null ? ` · ${dataCurta(dependente.nascimento)}` : ''}`}
                    />
                  ))}
                </Grid>
              )}
            </>
          }
        />
      )}

      {aba === 'his' && (
        <Card titulo="Histórico" flush>
          <Historico
            linhas={membro.timelineActivities.edges.map((aresta: { node: any }) => aresta.node)}
          />
        </Card>
      )}
    </>
  );
};
