import { useEffect, useState } from 'react';

import { api, gql } from 'src/api/client';
import { Card, Chip, Vazio } from 'src/ui/primitives';

export type Bu = {
  id: string;
  name: string;
  apiKeyPreview: string;
  connectionStatus: 'ACTIVE' | 'INVALID' | 'PENDING';
  isDefault: boolean;
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

  const salvar = async () => {
    if (nome.trim() === '' || apiKey.trim() === '' || secretKey.trim() === '') {
      setErro('Preencha o nome, a api key e a secret key.');

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
      });

      setNome('');
      setApiKey('');
      setSecretKey('');
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
          <div className="adm-grid adm-grid--3">
            <div>
              <div className="adm-fieldlabel">Nome da BU</div>
              <input
                className="adm-input"
                value={nome}
                onChange={(evento) => setNome(evento.target.value)}
                placeholder="Prosperar - Nome do Clube"
              />
            </div>
            <div>
              <div className="adm-fieldlabel">API key</div>
              {/* type=password para a chave não ficar legível por cima do ombro
                  nem entrar num screenshot; o campo é limpo assim que salva. */}
              <input
                className="adm-input"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(evento) => setApiKey(evento.target.value)}
              />
            </div>
            <div>
              <div className="adm-fieldlabel">Secret key</div>
              <input
                className="adm-input"
                type="password"
                autoComplete="off"
                value={secretKey}
                onChange={(evento) => setSecretKey(evento.target.value)}
              />
            </div>
          </div>

          <div className="adm-toolbar">
            <label className="adm-fieldlabel">
              <input
                type="checkbox"
                checked={padrao}
                onChange={(evento) => setPadrao(evento.target.checked)}
              />{' '}
              Usar esta BU para todos que não tiverem uma própria
            </label>
            <span className="adm-toolbar__spacer" />
            <button
              type="button"
              className="adm-btn adm-btn--primary"
              disabled={salvando}
              onClick={() => void salvar()}
            >
              {salvando ? 'Validando na Routerfy…' : 'Salvar chaves'}
            </button>
          </div>

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
          <div className="adm-grid adm-grid--2">
            <div>
              <div className="adm-fieldlabel">
                BU {dono === 'clube' ? 'deste clube' : 'deste membro'}
              </div>
              <select
                className="adm-input"
                value={businessUnitId ?? ''}
                onChange={(evento) =>
                  void ligar(evento.target.value === '' ? null : evento.target.value)
                }
              >
                <option value="">
                  Herdar{' '}
                  {dono === 'membro' ? 'do clube ou da BU padrão' : 'da BU padrão'}
                </option>
                {bus.map((bu) => (
                  <option key={bu.id} value={bu.id}>
                    {bu.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <table className="adm-table">
            <thead>
              <tr>
                <th>BU</th>
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
