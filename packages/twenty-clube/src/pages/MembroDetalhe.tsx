import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { gql } from 'src/api/client';
import { MEMBRO_QUERY } from 'src/api/queries';
import { type Etapa } from 'src/api/types';
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
  const [membro, setMembro] = useState<Record<string, any> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('crm');

  useEffect(() => {
    let cancelado = false;

    void (async () => {
      try {
        const dados = await gql<{ membro: Record<string, any> }>(MEMBRO_QUERY, { id });

        if (!cancelado) {
          setMembro(dados.membro);
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

  if (membro === null) {
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
      </div>

      <Tabs itens={ABAS} valor={aba} onChange={setAba} />

      {aba === 'crm' && (
        <Card titulo="Jornada do membro" flush>
          <Jornada etapas={etapas} />
        </Card>
      )}

      {aba === 'cad' && (
        <Card titulo={rotuloDe(membro.papel)}>
          <Grid colunas={3}>
            <Campo rotulo="Nome completo" valor={texto(membro.name)} />
            <Campo rotulo="CPF" valor={texto(membro.cpf)} />
            <Campo rotulo="RG" valor={texto(membro.rg)} />
            <Campo rotulo="Data de nascimento" valor={dataCurta(membro.nascimento)} />
            <Campo rotulo="Profissão" valor={texto(membro.profissao)} />
            <Campo rotulo="Estado civil" valor={texto(membro.estadoCivil)} />
          </Grid>
          <Grid colunas={2}>
            <Campo rotulo="E-mail" valor={texto(membro.emails?.primaryEmail)} />
            <Campo rotulo="Celular" valor={telefone(membro.telefones)} />
          </Grid>
          <Grid colunas={3}>
            <Campo rotulo="Sexo" valor={membro.sexo !== null ? (SEXO[membro.sexo] ?? membro.sexo) : TRACO} />
            <Campo rotulo="Nacionalidade" valor={texto(membro.nacionalidade)} />
            <Campo rotulo="Naturalidade" valor={texto(membro.naturalidade)} />
            <Campo rotulo="CNPJ" valor={texto(membro.cnpj)} />
            <Campo rotulo="Telefone fixo" valor={telefone(membro.telefoneFixo)} />
            <Campo rotulo="Cônjuge" valor={texto(membro.conjuge)} />
          </Grid>
          <Secao>Endereço</Secao>
          <Grid colunas={2}>
            <Campo rotulo="Endereço" valor={enderecoLinha(membro.endereco)} />
            <Campo rotulo="CEP" valor={texto(membro.endereco?.addressPostcode)} />
          </Grid>
          <Secao>Redes</Secao>
          <Grid colunas={3}>
            <Campo rotulo="Instagram" valor={linkTexto(membro.instagram)} />
            <Campo rotulo="LinkedIn" valor={linkTexto(membro.linkedin)} />
            <Campo rotulo="Site" valor={linkTexto(membro.site)} />
          </Grid>
        </Card>
      )}

      {aba === 'acc' && (
        <>
          <Card titulo="Contrato">
            <Grid colunas={3}>
              <Campo rotulo="Número do contrato" valor={texto(membro.contratoNumero)} />
              <Campo rotulo="Status" valor={<Chip valor={membro.contratoSituacao} />} />
              <Campo rotulo="Data assinatura" valor={dataCurta(membro.contratoAssinadoEm)} />
            </Grid>
            <Grid colunas={2}>
              <Campo rotulo="Link do contrato" valor={linkTexto(membro.contratoLink)} />
              <Campo rotulo="Entrou em" valor={dataCurta(membro.entradaEm)} />
            </Grid>
          </Card>

          <Card titulo="Financeiro">
            <Grid colunas={3}>
              <Campo rotulo="Valor total (R$)" valor={dinheiro(membro.valorTotal)} />
              <Campo rotulo="Modelo de pagamento" valor={texto(membro.modeloPagamento)} />
              <Campo rotulo="Link pagamento (FastPay)" valor={linkTexto(membro.linkFastpay)} />
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
          </Card>

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
        <Card titulo="Relacionamento">
          <Grid colunas={3}>
            <Campo rotulo="Nome no crachá" valor={texto(membro.nomeCracha)} />
            <Campo rotulo="Camiseta" valor={texto(membro.camiseta)} />
            <Campo rotulo="Calça (nº)" valor={texto(membro.calca)} />
            <Campo rotulo="Moletom" valor={texto(membro.moletom)} />
            <Campo rotulo="Calçado (nº)" valor={texto(membro.calcado)} />
            <Campo rotulo="Chocolate favorito" valor={texto(membro.chocolateFavorito)} />
            <Campo rotulo="Fruta favorita" valor={texto(membro.frutaFavorita)} />
            <Campo rotulo="Contato emergência — Nome" valor={texto(membro.contatoEmergenciaNome)} />
            <Campo
              rotulo="Contato emergência — Telefone"
              valor={telefone(membro.contatoEmergenciaTelefone)}
            />
          </Grid>
          <Secao>Sobre</Secao>
          <Grid colunas={2}>
            <Campo rotulo="Mini bio" valor={texto(membro.miniBio)} />
            <Campo rotulo="Maior objetivo no projeto" valor={texto(membro.maiorObjetivo)} />
            <Campo rotulo="Observações" valor={texto(membro.observacoes)} />
            <Campo
              rotulo="Placa / Reconhecimento"
              valor={
                membro.placaEntregue === true
                  ? `Entregue ${membro.placaEntregueEm !== null ? `em ${dataCurta(membro.placaEntregueEm)}` : ''}`
                  : 'Não entregue'
              }
            />
          </Grid>
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
        </Card>
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
