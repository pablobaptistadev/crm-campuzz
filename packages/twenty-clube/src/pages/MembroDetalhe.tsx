import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { gql } from 'src/api/client';
import { carregarMetadata, type ObjetoMeta } from 'src/api/metadata';
import { ARQUIVAR_MEMBRO, montarMembroQuery } from 'src/api/queries';
import { type Etapa } from 'src/api/types';
import { Historico } from 'src/ui/Historico';
import { EtapasEmCards, type EtapaCompleta } from 'src/ui/EtapaCard';
import { CardEditavel } from 'src/ui/CardEditavel';
import { Bus } from 'src/ui/Bus';
import { FinanceiroAutomatico } from 'src/ui/FinanceiroAutomatico';
import { CadastroCompleto, type GrupoDeCampos } from 'src/ui/CadastroCompleto';
import { CamposDoPerfil } from 'src/modules/perfil/ui/CamposDoPerfil';
import { AvatarDoMembro } from 'src/modules/perfil/ui/AvatarDoMembro';
import { FotoDePerfil } from 'src/modules/perfil/ui/FotoDePerfil';
import { Filhos, type Dependente } from 'src/ui/Filhos';
import { Pendencias, type Pendencia } from 'src/ui/Pendencias';
import { NovaVenda } from 'src/ui/NovaVenda';
import { ChipDeAtraso } from 'src/ui/ChipDeAtraso';
import { StatusEditavel } from 'src/ui/StatusEditavel';
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

type Aba = 'crm' | 'cad' | 'acc' | 'cx' | 'his' | 'cfg';

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'crm', rotulo: 'CRM' },
  { id: 'cad', rotulo: 'Cadastro' },
  { id: 'acc', rotulo: 'Acompanhamento' },
  { id: 'cx', rotulo: 'Rel. CX' },
  { id: 'his', rotulo: 'Histórico' },
  { id: 'cfg', rotulo: 'Configurações' },
];

// Ordem do que já conhecemos; o resto entra em "Outros campos" e continua
// editável, então um campo novo não depende de alguém lembrar desta lista.
const GRUPOS_DO_MEMBRO: GrupoDeCampos[] = [
  {
    titulo: 'Documentos',
    campos: ['rg', 'cnpj', 'nascimento', 'sexo', 'estadoCivil', 'nacionalidade', 'naturalidade', 'profissao', 'conjuge'],
  },
  {
    // O financeiro mora junto do contato, não do contrato: é um jeito de falar
    // com a pessoa, e é onde quem atualiza cadastro vai procurar.
    titulo: 'Contato',
    campos: ['emailFinanceiro', 'telefones', 'telefoneFixo', 'endereco', 'instagram', 'linkedin', 'site'],
  },
  {
    titulo: 'No clube',
    campos: ['nomeCracha', 'papel', 'situacao', 'entradaEm'],
  },
  {
    titulo: 'Contrato',
    campos: ['contratoNumero', 'contratoSituacao', 'contratoAssinadoEm', 'contratoLink', 'valorTotal', 'modeloPagamento', 'linkFastpay'],
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
  const [metaParcela, setMetaParcela] = useState<ObjetoMeta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('crm');
  const [abrindoVenda, setAbrindoVenda] = useState(false);

  // Uma alteração salva já vale na tela; recarregar o registro inteiro para
  // repintar um campo custaria uma volta ao banco por edição.
  const aplicarParcela = (parcelaId: string, situacao: string) =>
    setMembro((atual) =>
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
    setMembro((atual) => (atual === null ? atual : { ...atual, ...mudancas }));

  useEffect(() => {
    let cancelado = false;

    void (async () => {
      try {
        // O metadata decide quais campos pedir, então vem primeiro.
        const metadata = await carregarMetadata();
        const doMembro = metadata.get('membro') ?? null;

        if (doMembro === null) {
          throw new Error('Não encontramos o objeto membro neste workspace.');
        }

        const dados = await gql<{ membro: Record<string, any> }>(
          montarMembroQuery(doMembro),
          { id },
        );

        if (!cancelado) {
          setMembro(dados.membro);
          setObjeto(doMembro);
          setMetaParcela(metadata.get('parcela') ?? null);
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

  if (membro === null || objeto === null || metaParcela === null) {
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
        <AvatarDoMembro nome={membro.name} fotoUrl={membro.fotoUrl} tamanho="titulo" />
        <div>
          <div className="adm-record__name">{membro.name}</div>
          <div className="adm-record__sub">{clube?.name ?? TRACO}</div>
        </div>
        <span className="adm-record__spacer" />
        <div className="adm-record__acoes">
        <ChipDeAtraso
          parcelas={parcelas}
          contratos={membro.contratos}
        />
        <StatusEditavel
          objeto={objeto}
          registroId={membro.id}
          valor={membro.situacao}
          onSalvo={(proximo) => aplicar({ situacao: proximo })}
          tamanho="titulo"
        />
        <Arquivar
          mutation={ARQUIVAR_MEMBRO}
          registroId={membro.id}
          nome={membro.name}
          oQue="membro"
          onArquivado={() => navegar(clube === null ? '/' : `/clubes/${clube.id}`)}
        />
        </div>
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
        <>
        <Card titulo="Perfil">
          <FotoDePerfil
            membroId={membro.id}
            nome={membro.name}
            fotoUrl={membro.fotoUrl ?? null}
            onTrocada={(url) => aplicar({ fotoUrl: url })}
          />
          <CamposDoPerfil
            membroId={membro.id}
            perfil={{
              nomeCompleto: membro.name ?? '',
              email: membro.emails?.primaryEmail ?? '',
              cpf: membro.cpf ?? null,
              miniBio: membro.miniBio ?? null,
              fotoUrl: membro.fotoUrl ?? null,
            }}
            onSalvo={(salvo) =>
              aplicar({
                name: salvo.nomeCompleto,
                cpf: salvo.cpf,
                miniBio: salvo.miniBio,
                emails: { ...(membro.emails ?? {}), primaryEmail: salvo.email },
              })
            }
          />
        </Card>

        <CadastroCompleto
          objeto={objeto}
          registroId={membro.id}
          registro={membro}
          onSalvo={aplicar}
          grupos={GRUPOS_DO_MEMBRO}
          excluir={['name', 'emails', 'cpf', 'miniBio', 'fotoUrl']}
        />
        </>
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
                            <StatusEditavel
                              objeto={metaParcela}
                              registroId={parcela.id}
                              valor={parcela.situacao}
                              onSalvo={(proximo) =>
                                aplicarParcela(parcela.id, proximo)
                              }
                            />
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

          <FinanceiroAutomatico
            dono="membro"
            donoId={membro.id as string}
            parcelasManuais={parcelas}
          />

          <Card titulo="Pendências" flush>
            <Pendencias
              membroId={membro.id}
              pendencias={pendencias as Pendencia[]}
              onMudou={(proximas) =>
                setMembro((atual) =>
                  atual === null
                    ? atual
                    : {
                        ...atual,
                        pendencias: {
                          ...atual.pendencias,
                          edges: proximas.map((node) => ({ node })),
                        },
                      },
                )
              }
            />
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
            <Filhos
              membroId={membro.id}
              dependentes={dependentes as Dependente[]}
              onMudou={(proximos) =>
                setMembro((atual) =>
                  atual === null
                    ? atual
                    : {
                        ...atual,
                        dependentes: {
                          ...atual.dependentes,
                          edges: proximos.map((node) => ({ node })),
                        },
                      },
                )
              }
            />
          }
        />
      )}

      {aba === 'cfg' && (
        <Bus
          dono="membro"
          donoId={membro.id as string}
          businessUnitId={(membro.businessUnit as { id?: string } | null)?.id ?? null}
          onLigada={(businessUnitId) =>
            setMembro((atual) =>
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
          <Historico
            linhas={membro.timelineActivities.edges.map((aresta: { node: any }) => aresta.node)}
            campoAlvo="targetMembroId"
            alvoId={membro.id}
            onMudou={(proximas) =>
              setMembro((atual) =>
                atual === null
                  ? atual
                  : {
                      ...atual,
                      timelineActivities: {
                        ...atual.timelineActivities,
                        edges: proximas.map((node) => ({ node })),
                      },
                    },
              )
            }
          />
        </Card>
      )}
    </>
  );
};
