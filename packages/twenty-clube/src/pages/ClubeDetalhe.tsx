import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { gql } from 'src/api/client';
import { CLUBE_QUERY } from 'src/api/queries';
import { type Etapa, type Socio } from 'src/api/types';
import { Historico } from 'src/ui/Historico';
import { Jornada } from 'src/ui/Jornada';
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
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('crm');

  useEffect(() => {
    let cancelado = false;

    void (async () => {
      try {
        const dados = await gql<{ clube: Record<string, any> }>(CLUBE_QUERY, { id });

        if (!cancelado) {
          setClube(dados.clube);
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

  if (clube === null) {
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
            <Card key={socio.id} titulo={socio.papel ?? 'Sócio'}>
              <Grid colunas={3}>
                <Campo rotulo="Nome completo" valor={texto(socio.name)} />
                <Campo rotulo="CPF" valor={texto(socio.cpf)} />
                <Campo rotulo="RG" valor={texto(socio.rg)} />
                <Campo rotulo="Data de nascimento" valor={dataCurta(socio.nascimento)} />
                <Campo rotulo="Profissão" valor={texto(socio.profissao)} />
                <Campo rotulo="Estado civil" valor={texto(socio.estadoCivil)} />
              </Grid>
              <Grid colunas={2}>
                <Campo rotulo="E-mail" valor={texto(socio.emails?.primaryEmail)} />
                <Campo rotulo="Celular" valor={telefone(socio.telefones)} />
              </Grid>
              <Grid colunas={3}>
                <Campo rotulo="Sexo" valor={rotuloDe(socio.sexo === 'F' ? 'Feminino' : socio.sexo === 'M' ? 'Masculino' : socio.sexo)} />
                <Campo rotulo="Nacionalidade" valor={texto(socio.nacionalidade)} />
                <Campo rotulo="Naturalidade" valor={texto(socio.naturalidade)} />
              </Grid>
              <Secao>Endereço</Secao>
              <Grid colunas={2}>
                <Campo rotulo="Endereço" valor={enderecoLinha(socio.endereco)} />
                <Campo rotulo="CEP" valor={texto(socio.endereco?.addressPostcode)} />
              </Grid>
              <Secao>Redes</Secao>
              <Grid colunas={3}>
                <Campo rotulo="Instagram" valor={linkTexto(socio.instagram)} />
                <Campo rotulo="LinkedIn" valor={linkTexto(socio.linkedin)} />
                <Campo rotulo="Site" valor={linkTexto(socio.site)} />
              </Grid>
            </Card>
          ))
        ))}

      {aba === 'acc' && (
        <>
          <Card titulo="Contrato / MOU">
            <Grid colunas={3}>
              <Campo rotulo="Status" valor={<Chip valor={clube.mouSituacao} />} />
              <Campo rotulo="Data de assinatura" valor={dataCurta(clube.mouAssinadoEm)} />
              <Campo rotulo="Válido até" valor={dataCurta(clube.mouValidade)} />
            </Grid>
            <Grid colunas={2}>
              <Campo rotulo="Link do documento" valor={linkTexto(clube.mouLink)} />
              <Campo rotulo="Origem" valor={texto(clube.origemContrato)} />
            </Grid>
          </Card>

          <Card titulo="Financeiro">
            <Grid colunas={3}>
              <Campo rotulo="Valor total (R$)" valor={dinheiro(clube.capitalNegociado)} />
              <Campo rotulo="Modelo de pagamento" valor={texto(clube.modeloFinanceiro)} />
              <Campo rotulo="Data de início" valor={dataCurta(clube.inicio)} />
            </Grid>
            <Grid colunas={2}>
              <Campo rotulo="Link FastPay" valor={linkTexto(clube.linkFastpay)} />
              <Campo rotulo="Link de checkout" valor={linkTexto(clube.linkCheckout)} />
            </Grid>
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
            )}
          </Card>

          <Card titulo="Contratos">
            <Grid colunas={3}>
              <Campo rotulo="Contrato MLS" valor={sim(clube.contratoMlsAssinado)} />
              <Campo rotulo="Assinado em" valor={dataCurta(clube.contratoMlsEm)} />
              <Campo rotulo="ID MLS (Sankhya)" valor={texto(clube.mlsId)} />
              <Campo rotulo="Contrato SCP" valor={sim(clube.contratoScpAssinado)} />
              <Campo rotulo="Assinado em" valor={dataCurta(clube.contratoScpEm)} />
              <Campo rotulo="Kickoff" valor={sim(clube.kickoffFeito)} />
            </Grid>
          </Card>

          <Card titulo="Pipeline de etapas" flush>
            <Jornada etapas={pipeline} />
          </Card>

          <Card titulo="Operacional">
            <Grid colunas={3}>
              <Campo rotulo="LMS" valor={texto(clube.lms)} />
              <Campo rotulo="BU / Comunidade" valor={texto(clube.bu)} />
              <Campo rotulo="Responsável" valor={texto(clube.responsavel)} />
              <Campo rotulo="WhatsApp do clube" valor={linkTexto(clube.grupoWhatsapp)} />
              <Campo rotulo="MLS House" valor={sim(clube.mlsHouse)} />
              <Campo rotulo="Fastval" valor={sim(clube.fastval)} />
              <Campo rotulo="SCP criada" valor={sim(clube.scpCriada)} />
              <Campo rotulo="SCP criada em" valor={dataCurta(clube.scpCriadaEm)} />
            </Grid>
          </Card>
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
        <Card titulo="Relacionamento">
          <Grid colunas={3}>
            <Campo rotulo="Nome no crachá" valor={texto(clube.nomeCracha)} />
            <Campo rotulo="Camiseta" valor={texto(clube.camiseta)} />
            <Campo rotulo="Calça (nº)" valor={texto(clube.calca)} />
            <Campo rotulo="Moletom" valor={texto(clube.moletom)} />
            <Campo rotulo="Calçado (nº)" valor={texto(clube.calcado)} />
            <Campo rotulo="Chocolate favorito" valor={texto(clube.chocolateFavorito)} />
            <Campo rotulo="Fruta favorita" valor={texto(clube.frutaFavorita)} />
            <Campo rotulo="Contato emergência — Nome" valor={texto(clube.contatoEmergenciaNome)} />
            <Campo
              rotulo="Contato emergência — Telefone"
              valor={telefone(clube.contatoEmergenciaTelefone)}
            />
          </Grid>
          <Secao>Sobre</Secao>
          <Grid colunas={2}>
            <Campo rotulo="Mini bio" valor={texto(clube.miniBio)} />
            <Campo rotulo="Maior objetivo no projeto" valor={texto(clube.maiorObjetivo)} />
            <Campo rotulo="Observações" valor={texto(clube.observacoes)} />
            <Campo
              rotulo="Placa / Reconhecimento"
              valor={
                clube.placaEntregue === true
                  ? `Entregue ${clube.placaEntregueEm !== null ? `em ${dataCurta(clube.placaEntregueEm)}` : ''}`
                  : 'Não entregue'
              }
            />
          </Grid>
        </Card>
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
