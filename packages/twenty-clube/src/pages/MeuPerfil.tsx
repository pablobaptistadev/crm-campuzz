import { useState } from 'react';

import { meta } from 'src/api/client';
import { TrocarFoto } from 'src/modules/perfil/ui/TrocarFoto';
import { AcoesDoFormulario, Campos, CampoTexto } from 'src/ui/campos';
import { Card } from 'src/ui/primitives';

export type UsuarioDoPerfil = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  workspaceMember: { id: string; avatarUrl: string | null } | null;
};

const ATUALIZAR_NOME = `
  mutation AtualizarMeuPerfil($firstName: String!, $lastName: String!) {
    updateMyProfile(firstName: $firstName, lastName: $lastName)
  }
`;

const TROCAR_SENHA = `
  mutation TrocarMinhaSenha($currentPassword: String!, $newPassword: String!) {
    changeMyPassword(currentPassword: $currentPassword, newPassword: $newPassword)
  }
`;

export const MeuPerfil = ({
  usuario,
  onMudou,
}: {
  usuario: UsuarioDoPerfil;
  onMudou: (mudancas: Partial<UsuarioDoPerfil>) => void;
}) => {
  const [nome, setNome] = useState(usuario.firstName ?? '');
  const [sobrenome, setSobrenome] = useState(usuario.lastName ?? '');
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [avisoDoNome, setAvisoDoNome] = useState<{ ok: boolean; texto: string } | null>(null);

  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [avisoDaSenha, setAvisoDaSenha] = useState<{ ok: boolean; texto: string } | null>(null);

  const nomeCompleto =
    [usuario.firstName, usuario.lastName].filter(Boolean).join(' ') || usuario.email;

  const salvarNome = async () => {
    setSalvandoNome(true);
    setAvisoDoNome(null);

    try {
      await meta(ATUALIZAR_NOME, { firstName: nome, lastName: sobrenome });
      onMudou({ firstName: nome.trim(), lastName: sobrenome.trim() });
      setAvisoDoNome({ ok: true, texto: 'Nome atualizado. Ele já aparece no topo e no histórico.' });
    } catch (falha) {
      setAvisoDoNome({
        ok: false,
        texto: falha instanceof Error ? falha.message : 'Não conseguimos salvar o nome.',
      });
    } finally {
      setSalvandoNome(false);
    }
  };

  const trocarSenha = async () => {
    setAvisoDaSenha(null);

    // Conferido aqui para a pessoa não descobrir o erro de digitação só depois
    // de trocar — aí a senha nova seria uma que ela nem sabe qual é.
    if (novaSenha !== confirmacao) {
      setAvisoDaSenha({ ok: false, texto: 'A confirmação não bate com a nova senha.' });

      return;
    }

    setSalvandoSenha(true);

    try {
      await meta(TROCAR_SENHA, { currentPassword: senhaAtual, newPassword: novaSenha });
      setSenhaAtual('');
      setNovaSenha('');
      setConfirmacao('');
      setAvisoDaSenha({
        ok: true,
        texto: 'Senha trocada. Encerramos as suas outras sessões abertas; esta continua.',
      });
    } catch (falha) {
      setAvisoDaSenha({
        ok: false,
        texto: falha instanceof Error ? falha.message : 'Não conseguimos trocar a senha.',
      });
    } finally {
      setSalvandoSenha(false);
    }
  };

  const nomeMudou =
    nome.trim() !== (usuario.firstName ?? '') || sobrenome.trim() !== (usuario.lastName ?? '');

  return (
    <div className="adm-perfil">
      <div className="adm-record">
        {usuario.workspaceMember !== null && (
          <TrocarFoto
            dono="usuario"
            donoId={usuario.workspaceMember.id}
            nome={nomeCompleto}
            fotoUrl={usuario.workspaceMember.avatarUrl}
            tamanho="titulo"
            vazio="iniciais"
            onTrocada={(url) =>
              onMudou({
                workspaceMember:
                  usuario.workspaceMember === null
                    ? null
                    : { ...usuario.workspaceMember, avatarUrl: url },
              })
            }
          />
        )}
        <div>
          <div className="adm-record__name">{nomeCompleto}</div>
          <div className="adm-record__sub">{usuario.email}</div>
        </div>
      </div>

      <Card titulo="Meus dados">
        <Campos colunas={2}>
          <CampoTexto rotulo="Nome" valor={nome} onMudou={setNome} />
          <CampoTexto rotulo="Sobrenome" valor={sobrenome} onMudou={setSobrenome} />
        </Campos>

        <Campos colunas={2}>
          <label className="adm-campo">
            <span className="adm-campo__rotulo">E-mail de acesso</span>
            <input className="adm-input adm-campo__controle" value={usuario.email} readOnly />
            <span className="adm-campo__dica">
              O e-mail é o seu login. Trocá-lo exige confirmar o endereço novo, então
              pedimos pelo suporte em vez de mudar aqui.
            </span>
          </label>
        </Campos>

        {avisoDoNome !== null && (
          <div className={avisoDoNome.ok ? 'adm-ok' : 'adm-error'}>{avisoDoNome.texto}</div>
        )}

        <AcoesDoFormulario>
          <button
            type="button"
            className="adm-btn adm-btn--primary"
            disabled={salvandoNome || !nomeMudou}
            onClick={() => void salvarNome()}
          >
            {salvandoNome ? 'Salvando…' : 'Salvar dados'}
          </button>
        </AcoesDoFormulario>
      </Card>

      <Card titulo="Senha">
        <Campos colunas={3}>
          <CampoTexto rotulo="Senha atual" valor={senhaAtual} onMudou={setSenhaAtual} segredo />
          <CampoTexto
            rotulo="Nova senha"
            valor={novaSenha}
            onMudou={setNovaSenha}
            segredo
            dica="Pelo menos 8 caracteres."
          />
          <CampoTexto
            rotulo="Confirmar nova senha"
            valor={confirmacao}
            onMudou={setConfirmacao}
            segredo
            onEnter={() => void trocarSenha()}
          />
        </Campos>

        {avisoDaSenha !== null && (
          <div className={avisoDaSenha.ok ? 'adm-ok' : 'adm-error'}>{avisoDaSenha.texto}</div>
        )}

        <AcoesDoFormulario>
          <button
            type="button"
            className="adm-btn adm-btn--primary"
            disabled={salvandoSenha || senhaAtual === '' || novaSenha === ''}
            onClick={() => void trocarSenha()}
          >
            {salvandoSenha ? 'Trocando…' : 'Trocar senha'}
          </button>
        </AcoesDoFormulario>
      </Card>
    </div>
  );
};
