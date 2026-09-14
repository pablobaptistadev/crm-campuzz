import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { gql } from 'src/api/client';
import { CRIAR_PARCELAS, CRIAR_VENDA } from 'src/api/queries';
import {
  CRIAR_CLUBE,
  CRIAR_ETAPAS,
  CRIAR_SOCIO,
  JORNADA_CLUBE,
  PIPELINE_CLUBE,
} from 'src/api/clube-novo';
import {
  PERIODOS,
  dataLembrete,
  micros,
  montarParcelas,
  numeroLimpo,
} from 'src/ui/parcelas';
import { dataCurta } from 'src/ui/format';

const PASSOS = ['Clube', 'Dados', 'Financeiro', 'Revisão'];

const STATUS = [
  { value: 'ATIVO', label: 'Ativo' },
  { value: 'FAZER_MOU', label: 'Fazer MOU' },
  { value: 'EM_NEGOCIACAO', label: 'Em negociação' },
  { value: 'PENDENTE', label: 'Pendente' },
  { value: 'EM_ATRASO', label: 'Em atraso' },
  { value: 'PAUSADO', label: 'Pausado' },
  { value: 'PERDIDO', label: 'Perdido' },
];

const MOU = [
  { value: 'PENDENTE', label: 'Pendente' },
  { value: 'ENVIADO', label: 'Enviado' },
  { value: 'ASSINADO', label: 'Assinado' },
  { value: 'EXPIRADO', label: 'Expirado' },
];

const Campo = ({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) => (
  <div>
    <div className="adm-fieldlabel">{rotulo}</div>
    {children}
  </div>
);

const entrada = { width: '100%', minWidth: 0 } as const;

export const NovoClube = () => {
  const navegar = useNavigate();
  const [passo, setPasso] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState('');
  const [mentor, setMentor] = useState('');
  const [nicho, setNicho] = useState('');
  const [situacao, setSituacao] = useState('FAZER_MOU');

  const [socioNome, setSocioNome] = useState('');
  const [socioPapel, setSocioPapel] = useState('Sócio / Mentor');
  const [socioCpf, setSocioCpf] = useState('');
  const [socioEmail, setSocioEmail] = useState('');
  const [socioTelefone, setSocioTelefone] = useState('');

  const [responsavel, setResponsavel] = useState('');
  const [inicio, setInicio] = useState('');
  const [bu, setBu] = useState('');
  const [lms, setLms] = useState('');
  const [grupoWhatsapp, setGrupoWhatsapp] = useState('');
  const [linkCheckout, setLinkCheckout] = useState('');
  const [mouSituacao, setMouSituacao] = useState('PENDENTE');
  const [mouAssinadoEm, setMouAssinadoEm] = useState('');
  const [mouValidade, setMouValidade] = useState('');

  const [valorTotal, setValorTotal] = useState('');
  const [valorEntrada, setValorEntrada] = useState('');
  const [numeroParcelas, setNumeroParcelas] = useState('12');
  const [primeiroVencimento, setPrimeiroVencimento] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [periodicidade, setPeriodicidade] = useState('MENSAL');
  const [formaPagamento, setFormaPagamento] = useState('');
  const [diasLembrete, setDiasLembrete] = useState('3');

  const previa = useMemo(
    () =>
      montarParcelas({
        valorTotal,
        entrada: valorEntrada,
        quantidade: numeroParcelas,
        primeiroVencimento,
        periodicidade,
      }),
    [valorTotal, valorEntrada, numeroParcelas, primeiroVencimento, periodicidade],
  );

  const somaParcelas = previa.reduce((total, parcela) => total + parcela.valor, 0);
  const podeAvancar = passo !== 0 || nome.trim() !== '';

  const link = (valor: string, rotulo: string) =>
    valor.trim() === ''
      ? null
      : {
          primaryLinkUrl: /^https?:\/\//i.test(valor) ? valor : `https://${valor}`,
          primaryLinkLabel: rotulo,
        };

  const texto = (valor: string) => (valor.trim() === '' ? null : valor.trim());

  const criar = async () => {
    setSalvando(true);
    setErro(null);

    try {
      const clube = await gql<{ createClube: { id: string; name: string } }>(CRIAR_CLUBE, {
        data: {
          name: nome.trim(),
          mentor: texto(mentor),
          nicho: texto(nicho),
          situacao,
          responsavel: texto(responsavel),
          inicio: texto(inicio),
          bu: texto(bu),
          lms: texto(lms),
          grupoWhatsapp: link(grupoWhatsapp, 'Grupo do clube'),
          linkCheckout: link(linkCheckout, 'Checkout'),
          mouSituacao,
          mouAssinadoEm: texto(mouAssinadoEm),
          mouValidade: texto(mouValidade),
          capitalNegociado: numeroLimpo(valorTotal) > 0 ? micros(numeroLimpo(valorTotal)) : null,
          modeloFinanceiro: texto(formaPagamento),
          position: 'first',
        },
      });

      const clubeId = clube.createClube.id;

      // A jornada e o pipeline nascem com o clube: um clube sem etapas abre com
      // a aba CRM vazia e ninguém sabe por onde começar.
      await gql(CRIAR_ETAPAS, {
        data: [
          ...JORNADA_CLUBE.map((etapa, indice) => ({
            name: etapa,
            ordem: indice + 1,
            escopo: 'CLUBE',
            situacao: 'PENDENTE',
            clubeId,
            position: indice + 1,
          })),
          ...PIPELINE_CLUBE.map((etapa, indice) => ({
            name: etapa,
            ordem: 101 + indice,
            escopo: 'CLUBE',
            situacao: 'PENDENTE',
            clubeId,
            position: 101 + indice,
          })),
        ],
      });

      // O mentor quase sempre é o sócio: preencher o nome no passo 1 e ter de
      // cadastrar a mesma pessoa de novo depois é trabalho repetido.
      const nomeSocio = socioNome.trim() === '' ? mentor.trim() : socioNome.trim();

      if (nomeSocio !== '') {
        const digitos = socioTelefone.replace(/\D/g, '');

        await gql(CRIAR_SOCIO, {
          data: {
            name: nomeSocio,
            papel: texto(socioPapel),
            cpf: texto(socioCpf),
            emails: texto(socioEmail) === null ? null : { primaryEmail: socioEmail.trim() },
            telefones:
              digitos.length < 8
                ? null
                : {
                    primaryPhoneNumber: digitos.startsWith('55') ? digitos.slice(2) : digitos,
                    primaryPhoneCallingCode: '+55',
                    primaryPhoneCountryCode: 'BR',
                  },
            clubeId,
            position: 1,
          },
        });
      }

      if (previa.length > 0) {
        const venda = await gql<{ createVenda: { id: string } }>(CRIAR_VENDA, {
          data: {
            name: `${nome.trim()} — contrato`,
            valorTotal: micros(numeroLimpo(valorTotal)),
            entrada: numeroLimpo(valorEntrada) > 0 ? micros(numeroLimpo(valorEntrada)) : null,
            numeroParcelas: previa.length,
            primeiroVencimento,
            periodicidade,
            formaPagamento: texto(formaPagamento),
            situacao: 'ABERTA',
            fechadaEm: new Date().toISOString().slice(0, 10),
            clubeId,
            position: 'last',
          },
        });

        const antecedencia = Math.max(0, Number(diasLembrete) || 0);

        await gql(CRIAR_PARCELAS, {
          data: previa.map((parcela) => ({
            name: `${nome.trim()} — parcela ${parcela.numero}/${previa.length}`,
            numero: parcela.numero,
            valor: micros(parcela.valor),
            vencimento: parcela.vencimento,
            lembreteEm: dataLembrete(parcela.vencimento, antecedencia),
            situacao: 'PENDENTE',
            formaPagamento: texto(formaPagamento),
            vendaId: venda.createVenda.id,
            clubeId,
            position: parcela.numero,
          })),
        });
      }

      navegar(`/clubes/${clubeId}`);
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não conseguimos criar o clube.');
      setSalvando(false);
    }
  };

  return (
    <div className="adm-wizard">
      <div className="adm-wizard__topo">
        <div className="adm-wizard__titulo">Novo clube</div>
        <div className="adm-wizard__sub">
          Quatro passos. No fim o clube já nasce com a jornada, o pipeline e as parcelas.
        </div>
      </div>

      <div className="adm-passos">
        {PASSOS.map((rotulo, indice) => (
          <div
            key={rotulo}
            className={
              indice === passo
                ? 'adm-passo adm-passo--atual'
                : indice < passo
                  ? 'adm-passo adm-passo--feito'
                  : 'adm-passo'
            }
          >
            <span className="adm-passo__bolha">{indice < passo ? '✓' : indice + 1}</span>
            <span className="adm-passo__nome">{rotulo}</span>
          </div>
        ))}
      </div>

      {erro !== null && <div className="adm-error">{erro}</div>}

      {passo === 0 && (
        <div className="adm-painel">
          <div className="adm-painel__titulo">Como o clube se chama?</div>
          <div className="adm-painel__ajuda">
            É o nome que aparece no painel e no crachá dos membros.
          </div>
          <input
            className="adm-nome-grande"
            autoFocus
            placeholder="Legacy Mind Club"
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === 'Enter' && nome.trim() !== '') {
                setPasso(1);
              }
            }}
          />
          <div className="adm-grid adm-grid--3" style={{ marginTop: 24 }}>
            <Campo rotulo="Mentor">
              <input
                className="adm-input"
                style={entrada}
                value={mentor}
                onChange={(evento) => setMentor(evento.target.value)}
              />
            </Campo>
            <Campo rotulo="Nicho">
              <input
                className="adm-input"
                style={entrada}
                value={nicho}
                onChange={(evento) => setNicho(evento.target.value)}
              />
            </Campo>
            <Campo rotulo="Status">
              <select
                className="adm-input"
                style={entrada}
                value={situacao}
                onChange={(evento) => setSituacao(evento.target.value)}
              >
                {STATUS.map((opcao) => (
                  <option key={opcao.value} value={opcao.value}>
                    {opcao.label}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
        </div>
      )}

      {passo === 1 && (
        <div className="adm-painel">
          <div className="adm-painel__titulo">Dados do clube</div>
          <div className="adm-painel__ajuda">
            Tudo aqui é opcional e dá para completar depois, dentro do clube.
          </div>
          <div className="adm-grid adm-grid--3">
            <Campo rotulo="Responsável">
              <input
                className="adm-input"
                style={entrada}
                value={responsavel}
                onChange={(evento) => setResponsavel(evento.target.value)}
              />
            </Campo>
            <Campo rotulo="Início">
              <input
                className="adm-input"
                style={entrada}
                type="date"
                value={inicio}
                onChange={(evento) => setInicio(evento.target.value)}
              />
            </Campo>
            <Campo rotulo="BU / Comunidade">
              <input
                className="adm-input"
                style={entrada}
                value={bu}
                onChange={(evento) => setBu(evento.target.value)}
              />
            </Campo>
          </div>
          <div className="adm-grid adm-grid--3" style={{ marginTop: 16 }}>
            <Campo rotulo="LMS">
              <input
                className="adm-input"
                style={entrada}
                value={lms}
                onChange={(evento) => setLms(evento.target.value)}
              />
            </Campo>
            <Campo rotulo="Grupo de WhatsApp">
              <input
                className="adm-input"
                style={entrada}
                placeholder="chat.whatsapp.com/…"
                value={grupoWhatsapp}
                onChange={(evento) => setGrupoWhatsapp(evento.target.value)}
              />
            </Campo>
            <Campo rotulo="Link de checkout">
              <input
                className="adm-input"
                style={entrada}
                value={linkCheckout}
                onChange={(evento) => setLinkCheckout(evento.target.value)}
              />
            </Campo>
          </div>
          <div className="adm-section">Sócio / mentor</div>
          <div className="adm-grid adm-grid--3">
            <Campo rotulo="Nome completo">
              <input
                className="adm-input"
                style={entrada}
                placeholder={mentor === '' ? 'Mayara Sousa Santos Marinov' : mentor}
                value={socioNome}
                onChange={(evento) => setSocioNome(evento.target.value)}
              />
            </Campo>
            <Campo rotulo="Papel">
              <input
                className="adm-input"
                style={entrada}
                value={socioPapel}
                onChange={(evento) => setSocioPapel(evento.target.value)}
              />
            </Campo>
            <Campo rotulo="CPF">
              <input
                className="adm-input"
                style={entrada}
                value={socioCpf}
                onChange={(evento) => setSocioCpf(evento.target.value)}
              />
            </Campo>
          </div>
          <div className="adm-grid adm-grid--2" style={{ marginTop: 16 }}>
            <Campo rotulo="E-mail">
              <input
                className="adm-input"
                style={entrada}
                type="email"
                value={socioEmail}
                onChange={(evento) => setSocioEmail(evento.target.value)}
              />
            </Campo>
            <Campo rotulo="Celular">
              <input
                className="adm-input"
                style={entrada}
                type="tel"
                value={socioTelefone}
                onChange={(evento) => setSocioTelefone(evento.target.value)}
              />
            </Campo>
          </div>
          <div className="adm-painel__ajuda" style={{ marginTop: 8, marginBottom: 0 }}>
            Em branco, usamos o mentor do passo anterior.
          </div>

          <div className="adm-section">MOU</div>
          <div className="adm-grid adm-grid--3">
            <Campo rotulo="Situação">
              <select
                className="adm-input"
                style={entrada}
                value={mouSituacao}
                onChange={(evento) => setMouSituacao(evento.target.value)}
              >
                {MOU.map((opcao) => (
                  <option key={opcao.value} value={opcao.value}>
                    {opcao.label}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Assinado em">
              <input
                className="adm-input"
                style={entrada}
                type="date"
                value={mouAssinadoEm}
                onChange={(evento) => setMouAssinadoEm(evento.target.value)}
              />
            </Campo>
            <Campo rotulo="Válido até">
              <input
                className="adm-input"
                style={entrada}
                type="date"
                value={mouValidade}
                onChange={(evento) => setMouValidade(evento.target.value)}
              />
            </Campo>
          </div>
        </div>
      )}

      {passo === 2 && (
        <div className="adm-painel">
          <div className="adm-painel__titulo">Financeiro</div>
          <div className="adm-painel__ajuda">
            A entrada sai do total; o que sobra vira as parcelas. Cada parcela nasce como uma
            cobrança própria, com vencimento e lembrete.
          </div>
          <div className="adm-grid adm-grid--3">
            <Campo rotulo="Valor total (R$)">
              <input
                className="adm-input"
                style={entrada}
                inputMode="decimal"
                placeholder="75000"
                value={valorTotal}
                onChange={(evento) => setValorTotal(evento.target.value)}
              />
            </Campo>
            <Campo rotulo="Entrada (R$)">
              <input
                className="adm-input"
                style={entrada}
                inputMode="decimal"
                placeholder="15000"
                value={valorEntrada}
                onChange={(evento) => setValorEntrada(evento.target.value)}
              />
            </Campo>
            <Campo rotulo="Forma de pagamento">
              <input
                className="adm-input"
                style={entrada}
                placeholder="Pix, cartão, boleto…"
                value={formaPagamento}
                onChange={(evento) => setFormaPagamento(evento.target.value)}
              />
            </Campo>
          </div>
          <div className="adm-grid adm-grid--3" style={{ marginTop: 16 }}>
            <Campo rotulo="Nº de parcelas">
              <input
                className="adm-input"
                style={entrada}
                inputMode="numeric"
                value={numeroParcelas}
                onChange={(evento) => setNumeroParcelas(evento.target.value)}
              />
            </Campo>
            <Campo rotulo="1º vencimento">
              <input
                className="adm-input"
                style={entrada}
                type="date"
                value={primeiroVencimento}
                onChange={(evento) => setPrimeiroVencimento(evento.target.value)}
              />
            </Campo>
            <Campo rotulo="Periodicidade">
              <select
                className="adm-input"
                style={entrada}
                value={periodicidade}
                onChange={(evento) => setPeriodicidade(evento.target.value)}
              >
                {PERIODOS.map((periodo) => (
                  <option key={periodo.value} value={periodo.value}>
                    {periodo.label}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <div className="adm-grid adm-grid--3" style={{ marginTop: 16 }}>
            <Campo rotulo="Lembrar quantos dias antes">
              <input
                className="adm-input"
                style={entrada}
                inputMode="numeric"
                value={diasLembrete}
                onChange={(evento) => setDiasLembrete(evento.target.value)}
              />
            </Campo>
          </div>

          {previa.length > 0 && (
            <>
              <div className="adm-section">
                {previa.length} parcelas · R${' '}
                {somaParcelas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ maxHeight: 240, overflowY: 'auto' }} className="adm-table-wrap">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Vencimento</th>
                      <th>Lembrete</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previa.map((parcela) => (
                      <tr key={parcela.numero}>
                        <td className="adm-table__num">{parcela.numero}</td>
                        <td>{dataCurta(parcela.vencimento)}</td>
                        <td className="adm-table__muted">
                          {dataCurta(
                            dataLembrete(parcela.vencimento, Number(diasLembrete) || 0),
                          )}
                        </td>
                        <td className="adm-table__num">
                          R$ {parcela.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {passo === 3 && (
        <div className="adm-painel">
          <div className="adm-painel__titulo">Confere antes de criar</div>
          <div className="adm-painel__ajuda">
            Depois de criado, é só entrar no clube e ir adicionando os membros.
          </div>

          <div className="adm-grid adm-grid--2">
            <div className="adm-resumo">
              <div className="adm-resumo__linha">
                <span className="adm-resumo__rotulo">Clube</span>
                <span className="adm-resumo__valor adm-resumo__destaque">{nome || '—'}</span>
              </div>
              <div className="adm-resumo__linha">
                <span className="adm-resumo__rotulo">Mentor</span>
                <span className="adm-resumo__valor">{mentor || '—'}</span>
              </div>
              <div className="adm-resumo__linha">
                <span className="adm-resumo__rotulo">Status</span>
                <span className="adm-resumo__valor">
                  {STATUS.find((item) => item.value === situacao)?.label}
                </span>
              </div>
              <div className="adm-resumo__linha">
                <span className="adm-resumo__rotulo">Responsável</span>
                <span className="adm-resumo__valor">{responsavel || '—'}</span>
              </div>
              <div className="adm-resumo__linha">
                <span className="adm-resumo__rotulo">Início</span>
                <span className="adm-resumo__valor">{dataCurta(inicio)}</span>
              </div>
              <div className="adm-resumo__linha">
                <span className="adm-resumo__rotulo">Sócio</span>
                <span className="adm-resumo__valor">
                  {socioNome.trim() === '' ? mentor || '—' : socioNome}
                </span>
              </div>
              <div className="adm-resumo__linha">
                <span className="adm-resumo__rotulo">Jornada</span>
                <span className="adm-resumo__valor">
                  {JORNADA_CLUBE.length} etapas + {PIPELINE_CLUBE.length} do pipeline
                </span>
              </div>
            </div>

            <div className="adm-resumo">
              <div className="adm-resumo__linha">
                <span className="adm-resumo__rotulo">Valor total</span>
                <span className="adm-resumo__valor adm-resumo__destaque">
                  R$ {numeroLimpo(valorTotal).toLocaleString('pt-BR')}
                </span>
              </div>
              <div className="adm-resumo__linha">
                <span className="adm-resumo__rotulo">Entrada</span>
                <span className="adm-resumo__valor">
                  R$ {numeroLimpo(valorEntrada).toLocaleString('pt-BR')}
                </span>
              </div>
              <div className="adm-resumo__linha">
                <span className="adm-resumo__rotulo">Forma de pagamento</span>
                <span className="adm-resumo__valor">{formaPagamento || '—'}</span>
              </div>
              <div className="adm-resumo__linha">
                <span className="adm-resumo__rotulo">Parcelas</span>
                <span className="adm-resumo__valor">
                  {previa.length === 0
                    ? 'nenhuma'
                    : `${previa.length}x de R$ ${previa[1]?.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) ?? previa[0].valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                </span>
              </div>
              <div className="adm-resumo__linha">
                <span className="adm-resumo__rotulo">1º vencimento</span>
                <span className="adm-resumo__valor">{dataCurta(primeiroVencimento)}</span>
              </div>
              <div className="adm-resumo__linha">
                <span className="adm-resumo__rotulo">Lembrete</span>
                <span className="adm-resumo__valor">{diasLembrete} dias antes</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="adm-wizard__rodape">
        <button
          type="button"
          className="adm-btn"
          onClick={() => (passo === 0 ? navegar('/') : setPasso(passo - 1))}
          disabled={salvando}
        >
          {passo === 0 ? 'Cancelar' : 'Voltar'}
        </button>
        <span className="adm-toolbar__spacer" />
        {passo < PASSOS.length - 1 ? (
          <button
            type="button"
            className="adm-btn adm-btn--primary"
            disabled={!podeAvancar}
            onClick={() => setPasso(passo + 1)}
          >
            Continuar
          </button>
        ) : (
          <button
            type="button"
            className="adm-btn adm-btn--primary"
            disabled={salvando || nome.trim() === ''}
            onClick={() => void criar()}
          >
            {salvando ? 'Criando…' : 'Criar clube'}
          </button>
        )}
      </div>
    </div>
  );
};
