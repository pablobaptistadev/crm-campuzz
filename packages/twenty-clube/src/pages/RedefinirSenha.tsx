import { useEffect, useState } from 'react';

import { ApiError, meta } from 'src/api/client';
import { CONFERIR_LINK_DE_SENHA_QUERY, REDEFINIR_SENHA_MUTATION } from 'src/api/queries';
import { AcoesSecundarias, CampoDeAcesso, CartaoDeAcesso } from 'src/ui/CartaoDeAcesso';

type Estado =
  | { etapa: 'conferindo' }
  | { etapa: 'pronto'; email: string }
  | { etapa: 'invalido'; motivo: string }
  | { etapa: 'concluido' };

const FALHA_GENERICA = 'Não conseguimos salvar a senha nova. Tente de novo em instantes.';

// As recusas deste fluxo já vêm em português do servidor (link vencido, senha
// curta), escritas para quem está na tela.
const mensagemDa = (causa: unknown): string =>
  causa instanceof ApiError && causa.message !== 'A resposta veio sem dados.'
    ? causa.message
    : FALHA_GENERICA;

export const RedefinirSenha = ({
  token,
  onIrParaLogin,
}: {
  token: string;
  onIrParaLogin: () => void;
}) => {
  const [estado, setEstado] = useState<Estado>({ etapa: 'conferindo' });
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Conferir antes de pedir a senha: com o link vencido, a pessoa descobre
  // agora, e não depois de digitar a senha duas vezes.
  useEffect(() => {
    if (token.length === 0) {
      setEstado({ etapa: 'invalido', motivo: 'O link está incompleto. Abra de novo o link do e-mail.' });

      return;
    }

    meta<{ validatePasswordResetToken: { email: string } }>(CONFERIR_LINK_DE_SENHA_QUERY, { token })
      .then((dados) => setEstado({ etapa: 'pronto', email: dados.validatePasswordResetToken.email }))
      .catch((causa: unknown) => setEstado({ etapa: 'invalido', motivo: mensagemDa(causa) }));
  }, [token]);

  const salvar = async () => {
    setErro(null);

    if (novaSenha !== confirmacao) {
      setErro('A confirmação não bate com a nova senha.');

      return;
    }

    setSalvando(true);

    try {
      await meta(REDEFINIR_SENHA_MUTATION, { token, newPassword: novaSenha });
      setEstado({ etapa: 'concluido' });
    } catch (causa) {
      setErro(mensagemDa(causa));
    } finally {
      setSalvando(false);
    }
  };

  if (estado.etapa === 'conferindo') {
    return <div className="adm-loading">Conferindo o link…</div>;
  }

  if (estado.etapa === 'invalido' || estado.etapa === 'concluido') {
    return (
      <CartaoDeAcesso titulo="Redefinir senha" onSubmit={onIrParaLogin}>
        {estado.etapa === 'invalido' ? (
          <div className="adm-error">{estado.motivo}</div>
        ) : (
          <div className="adm-ok">
            Senha nova salva. Por segurança, encerramos as sessões abertas: entre de novo com ela.
          </div>
        )}
        <button className="adm-btn adm-btn--primary" style={{ width: '100%' }} type="submit">
          Ir para o login
        </button>
      </CartaoDeAcesso>
    );
  }

  return (
    <CartaoDeAcesso
      titulo="Criar senha nova"
      explicacao={`Para a conta ${estado.email}. Use pelo menos 8 caracteres.`}
      onSubmit={() => void salvar()}
    >
      {erro !== null && <div className="adm-error">{erro}</div>}

      {/* O gerenciador de senhas precisa do e-mail para guardar a senha nova na conta certa. */}
      <input type="email" autoComplete="username" value={estado.email} readOnly hidden />

      <CampoDeAcesso rotulo="Nova senha">
        <input
          className="adm-input"
          style={{ width: '100%', minWidth: 0 }}
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={novaSenha}
          onChange={(evento) => setNovaSenha(evento.target.value)}
        />
      </CampoDeAcesso>

      <CampoDeAcesso rotulo="Confirmar nova senha">
        <input
          className="adm-input"
          style={{ width: '100%', minWidth: 0 }}
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={confirmacao}
          onChange={(evento) => setConfirmacao(evento.target.value)}
        />
      </CampoDeAcesso>

      <button
        className="adm-btn adm-btn--primary"
        style={{ width: '100%' }}
        type="submit"
        disabled={salvando}
      >
        {salvando ? 'Salvando…' : 'Salvar senha nova'}
      </button>

      <AcoesSecundarias>
        <button type="button" className="adm-link-botao" onClick={onIrParaLogin}>
          Voltar para o login
        </button>
      </AcoesSecundarias>
    </CartaoDeAcesso>
  );
};
