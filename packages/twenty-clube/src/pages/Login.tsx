import { useState } from 'react';

import { ApiError, meta } from 'src/api/client';
import {
  ENTRAR_COM_CODIGO_MUTATION,
  ENVIAR_CODIGO_MUTATION,
  ESQUECI_A_SENHA_MUTATION,
  EXCHANGE_MUTATION,
  LOGIN_MUTATION,
} from 'src/api/queries';
import { AcoesSecundarias, CampoDeAcesso, CartaoDeAcesso } from 'src/ui/CartaoDeAcesso';
import { CampoDeSenha } from 'src/ui/CampoDeSenha';
import { mensagemDeErroDeLogin } from 'src/ui/erroDeLogin';

type Modo = 'senha' | 'codigo' | 'esqueci';

type RespostaDeLogin<TCampo extends string> = Record<TCampo, { loginToken: { token: string } }>;

// O servidor responde igual para e-mail com e sem conta, então a tela também
// não pode afirmar que mandou: diz que mandou se a conta existir.
const AVISO_DE_CODIGO =
  'Se houver uma conta com este e-mail, enviamos um código de 6 dígitos. Ele vale por 10 minutos.';
const AVISO_DE_LINK =
  'Se houver uma conta com este e-mail, enviamos um link para criar uma senha nova. Ele vale por 1 hora.';

export const Login = ({ onEntrou }: { onEntrou: () => void }) => {
  const [modo, setModo] = useState<Modo>('senha');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [codigo, setCodigo] = useState('');
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [linkEnviado, setLinkEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const trocarModo = (novo: Modo) => {
    setModo(novo);
    setErro(null);
    setAviso(null);
    setCodigo('');
    setCodigoEnviado(false);
    setLinkEnviado(false);
  };

  const executar = async (acao: () => Promise<void>) => {
    setErro(null);
    setEnviando(true);

    try {
      await acao();
    } catch (causa) {
      setErro(mensagemDeErroDeLogin(causa instanceof ApiError ? causa.message : null));
    } finally {
      setEnviando(false);
    }
  };

  // Senha e código terminam igual: o servidor devolve um loginToken, e é a
  // troca dele que abre a sessão.
  const abrirSessao = async (loginToken: string) => {
    await meta(EXCHANGE_MUTATION, { loginToken });
    onEntrou();
  };

  const entrarComSenha = () =>
    executar(async () => {
      const login = await meta<RespostaDeLogin<'getLoginTokenFromCredentials'>>(LOGIN_MUTATION, {
        email,
        password: senha,
      });

      await abrirSessao(login.getLoginTokenFromCredentials.loginToken.token);
    });

  const enviarCodigo = () =>
    executar(async () => {
      await meta(ENVIAR_CODIGO_MUTATION, { email });
      setCodigoEnviado(true);
      setCodigo('');
      setAviso(AVISO_DE_CODIGO);
    });

  const entrarComCodigo = () =>
    executar(async () => {
      const login = await meta<RespostaDeLogin<'getLoginTokenFromEmailCode'>>(
        ENTRAR_COM_CODIGO_MUTATION,
        { email, code: codigo },
      );

      await abrirSessao(login.getLoginTokenFromEmailCode.loginToken.token);
    });

  const enviarLink = () =>
    executar(async () => {
      await meta(ESQUECI_A_SENHA_MUTATION, { email });
      setLinkEnviado(true);
      setAviso(AVISO_DE_LINK);
    });

  const enviar = () => {
    if (modo === 'senha') {
      void entrarComSenha();
    } else if (modo === 'codigo') {
      void (codigoEnviado ? entrarComCodigo() : enviarCodigo());
    } else {
      void enviarLink();
    }
  };

  const textoDoBotao = (() => {
    if (modo === 'esqueci') {
      return enviando ? 'Enviando…' : 'Enviar link';
    }

    if (modo === 'codigo' && !codigoEnviado) {
      return enviando ? 'Enviando…' : 'Enviar código';
    }

    return enviando ? 'Entrando…' : 'Entrar';
  })();

  return (
    <CartaoDeAcesso
      titulo={
        modo === 'codigo' ? 'Entrar com código' : modo === 'esqueci' ? 'Esqueci minha senha' : undefined
      }
      explicacao={
        modo === 'codigo'
          ? 'Mandamos um código para o seu e-mail. Não precisa de senha.'
          : modo === 'esqueci'
            ? 'Digite o seu e-mail e mandamos um link para você criar uma senha nova.'
            : undefined
      }
      onSubmit={enviar}
    >
      {erro !== null && <div className="adm-error">{erro}</div>}
      {aviso !== null && <div className="adm-ok">{aviso}</div>}

      <CampoDeAcesso rotulo="E-mail">
        <input
          className="adm-input"
          style={{ width: '100%', minWidth: 0 }}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(evento) => {
            setEmail(evento.target.value);
            // O código e o link foram pedidos para o e-mail anterior.
            setCodigoEnviado(false);
            setLinkEnviado(false);
            setAviso(null);
          }}
        />
      </CampoDeAcesso>

      {modo === 'senha' && (
        <CampoDeAcesso
          rotulo="Senha"
          acessorio={
            <button type="button" className="adm-link-botao" onClick={() => trocarModo('esqueci')}>
              Esqueci minha senha
            </button>
          }
        >
          <CampoDeSenha valor={senha} onChange={setSenha} autoComplete="current-password" />
        </CampoDeAcesso>
      )}

      {modo === 'codigo' && codigoEnviado && (
        <CampoDeAcesso rotulo="Código">
          <input
            className="adm-input"
            style={{ width: '100%', minWidth: 0, letterSpacing: 4, fontSize: 18 }}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            placeholder="000000"
            required
            autoFocus
            value={codigo}
            onChange={(evento) => setCodigo(evento.target.value)}
          />
        </CampoDeAcesso>
      )}

      {!(modo === 'esqueci' && linkEnviado) && (
        <button
          className="adm-btn adm-btn--primary"
          style={{ width: '100%' }}
          type="submit"
          disabled={enviando}
        >
          {textoDoBotao}
        </button>
      )}

      <AcoesSecundarias>
        {modo === 'senha' && (
          <button type="button" className="adm-link-botao" onClick={() => trocarModo('codigo')}>
            Entrar com código por e-mail
          </button>
        )}
        {modo === 'codigo' && codigoEnviado && (
          <button
            type="button"
            className="adm-link-botao"
            disabled={enviando}
            onClick={() => void enviarCodigo()}
          >
            Mandar outro código
          </button>
        )}
        {modo !== 'senha' && (
          <button type="button" className="adm-link-botao" onClick={() => trocarModo('senha')}>
            Entrar com senha
          </button>
        )}
      </AcoesSecundarias>
    </CartaoDeAcesso>
  );
};
