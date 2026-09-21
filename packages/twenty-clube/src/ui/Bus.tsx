import { useEffect, useState } from 'react';

import { api, gql } from 'src/api/client';
import {
  AcoesDoFormulario,
  CampoMarcar,
  CampoSelecao,
  Campos,
  CampoTexto,
  TextoEditavel,
} from 'src/ui/campos';
import { Card, Chip, Vazio } from 'src/ui/primitives';

export type Bu = {
  id: string;
  name: string;
  apiKeyPreview: string;
  connectionStatus: 'ACTIVE' | 'INVALID' | 'PENDING';
  isDefault: boolean;
  financeEmail: string | null;
  lastValidatedAt: string | null;
};

const LIGAR = `
  mutation($id: UUID!, $businessUnitId: UUID) {
    __TIPO__(id: $id, data: { businessUnitId: $businessUnitId }) { id }
  }
`;

export const Bus = ({
  dono,
  donoId,
  businessUnitId,
  onLigada,
}: {
  dono: 'clube' | 'membro';
  donoId: string;
  businessUnitId: string | null;
  onLigada: (businessUnitId: string | null) => void;
}) => {
  const [bus, setBus] = useState<Bu[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);

  const [nome, setNome] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [emailFinanceiro, setEmailFinanceiro] = useState('');
  const [padrao, setPadrao] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    try {
      setBus((await api<{ bus: Bu[] }>('/bus')).bus);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Erro inesperado.');
    }
  };

  useEffect(() => {
    void carregar();
  }, []);

  const ligar = async (escolhida: string | null) => {
    setErro(null);

    try {
      await gql(
        LIGAR.replace(
          '__TIPO__',
          dono === 'clube' ? 'updateClube' : 'updateMembro',
        ),
        { id: donoId, businessUnitId: escolhida },
      );

      onLigada(escolhida);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Erro inesperado.');
    }
  };

  const salvar = async () => {
    if (nome.trim() === '' || apiKey.trim() === '' || secretKey.trim() === '') {
      setErro('Preencha o nome, a api key e a secret key.');

      return;
    }

    // Sem o financeiro, o contrato de clube não tem contra o que ser conferido,
    // e o erro só apareceria lá na frente, na tela de vincular.
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailFinanceiro.trim())) {
      setErro('Informe o e-mail do financeiro do clube.');

      return;
    }

    setSalvando(true);
    setErro(null);

    try {
      const { bu } = await api<{ bu: Bu }>('/bus', {
        name: nome.trim(),
        apiKey: apiKey.trim(),
        secretKey: secretKey.trim(),
        isDefault: padrao,
        financeEmail: emailFinanceiro.trim(),
      });

      setNome('');
      setApiKey('');
      setSecretKey('');
      setEmailFinanceiro('');
      setPadrao(false);
      setAberto(false);
      await carregar();
      await ligar(bu.id);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Erro inesperado.');
    } finally {
      setSalvando(false);
    }
  };

  const trocarFinanceiro = async (bu: Bu, email: string) => {
    setErro(null);

    try {
      await api('/bus/financeiro', {
        businessUnitId: bu.id,
        financeEmail: email,
      });
      await carregar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Erro inesperado.');
    }
  };

  const herdarDe =
    dono === 'membro' ? 'do clube ou da BU padrão' : 'da BU padrão';

  return (
    <Card
      titulo="Chaves do gateway"
      acao={
        <button
          type="button"
          className="adm-btn"
          onClick={() => setAberto((estava) => !estava)}
        >
          {aberto ? 'Cancelar' : '+ Cadastrar BU'}
        </button>
      }
    >
      {erro !== null && <div className="adm-error">{erro}</div>}

      {aberto && (
        <>
          <Campos colunas={3}>
            <CampoTexto
              rotulo="Nome da BU"
              valor={nome}
              onMudou={setNome}
              placeholder="Prosperar - Nome do Clube"
            />
            <CampoTexto rotulo="API key" valor={apiKey} onMudou={setApiKey} segredo />
            <CampoTexto
              rotulo="Secret key"
              valor={secretKey}
              onMudou={setSecretKey}
              segredo
            />
          </Campos>

          <Campos colunas={2}>
            <CampoTexto
              rotulo="E-mail do financeiro do clube"
              valor={emailFinanceiro}
              onMudou={setEmailFinanceiro}
              placeholder="financeiro@clube.com.br"
              dica="É contra ele que conferimos o titular de um contrato de clube. O membro é conferido pelo e-mail dele, contrato a contrato."
            />
          </Campos>

          <CampoMarcar
            rotulo="Usar esta BU para todos que não tiverem uma própria"
            marcado={padrao}
            onMudou={setPadrao}
          />

          <AcoesDoFormulario>
            <button
              type="button"
              className="adm-btn adm-btn--primary"
              disabled={salvando}
              onClick={() => void salvar()}
            >
              {salvando ? 'Validando na Routerfy…' : 'Salvar chaves'}
            </button>
          </AcoesDoFormulario>

          <p className="adm-painel__ajuda">
            Validamos as chaves na Routerfy antes de gravar. Elas vão cifradas
            para o cofre e nunca aparecem em tela de novo.
          </p>
        </>
      )}

      {bus === null ? (
        <Vazio>Carregando…</Vazio>
      ) : bus.length === 0 ? (
        <Vazio>Nenhuma BU cadastrada ainda. Cadastre uma para puxar contratos.</Vazio>
      ) : (
        <>
          <Campos colunas={2}>
            <CampoSelecao
              rotulo={`BU ${dono === 'clube' ? 'deste clube' : 'deste membro'}`}
              valor={businessUnitId ?? ''}
              onMudou={(escolhida) => void ligar(escolhida === '' ? null : escolhida)}
              dica={`Em branco, herda ${herdarDe}.`}
              opcoes={[
                { valor: '', rotulo: `Herdar ${herdarDe}` },
                ...bus.map((bu) => ({ valor: bu.id, rotulo: bu.name })),
              ]}
            />
          </Campos>

          <p className="adm-painel__ajuda">
            O financeiro do clube pode ser corrigido a qualquer momento: clique
            no e-mail na tabela abaixo. As chaves ficam como estão.
          </p>

          <table className="adm-table">
            <thead>
              <tr>
                <th>BU</th>
                <th>Financeiro do clube</th>
                <th>Chave</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {bus.map((bu) => (
                <tr key={bu.id}>
                  <td>
                    {bu.name}
                    {bu.isDefault && <span className="adm-table__sub">padrão</span>}
                  </td>
                  <td className="adm-table__muted">
                    <TextoEditavel
                      valor={bu.financeEmail}
                      placeholder="financeiro@clube.com.br"
                      vazio="— definir"
                      aoSalvar={(email) => trocarFinanceiro(bu, email)}
                    />
                  </td>
                  <td className="adm-table__muted">{bu.apiKeyPreview || '—'}</td>
                  <td>
                    <Chip valor={bu.connectionStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
};
