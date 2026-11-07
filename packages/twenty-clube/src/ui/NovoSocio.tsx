import { useState } from 'react';

import { gql } from 'src/api/client';
import { CRIAR_SOCIO } from 'src/api/clube-novo';
import { formatarCpf, validarPerfil } from 'src/modules/perfil';

const PAPEIS = ['Sócio', 'Sócio / Mentor', 'Mentor', 'Investidor', 'Administrador'];

const entrada = { width: '100%', minWidth: 0 };

export const NovoSocio = ({
  clubeId,
  onFechar,
  onCriado,
}: {
  clubeId: string;
  onFechar: () => void;
  onCriado: (socio: Record<string, unknown>) => void;
}) => {
  const [nome, setNome] = useState('');
  const [papel, setPapel] = useState(PAPEIS[0] as string);
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [telefone, setTelefone] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = async () => {
    // A mesma regra do membro: o sócio é quem assina o contrato do clube, e
    // sem e-mail não há para onde mandar nada.
    const problemas = validarPerfil({
      nomeCompleto: nome,
      email,
      cpf: cpf.trim() === '' ? null : cpf,
      miniBio: null,
      fotoUrl: null,
    });

    if (problemas.length > 0) {
      setErro(problemas.map((problema) => problema.mensagem).join(' '));

      return;
    }

    setSalvando(true);
    setErro(null);

    try {
      const digitos = telefone.replace(/\D/g, '');

      const criado = await gql<{ createSocio: { id: string; name: string } }>(CRIAR_SOCIO, {
        data: {
          name: nome.trim().replace(/\s+/g, ' '),
          papel,
          cpf: cpf.trim() === '' ? null : cpf.replace(/\D/g, ''),
          emails: { primaryEmail: email.trim() },
          telefones:
            digitos.length < 8
              ? null
              : {
                  primaryPhoneNumber: digitos.startsWith('55') ? digitos.slice(2) : digitos,
                  primaryPhoneCallingCode: '+55',
                  primaryPhoneCountryCode: 'BR',
                },
          clubeId,
          position: 'last',
        },
      });

      onCriado({
        ...criado.createSocio,
        papel,
        cpf: cpf.trim() === '' ? null : cpf.replace(/\D/g, ''),
        emails: { primaryEmail: email.trim() },
      });
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não conseguimos criar o sócio.');
      setSalvando(false);
    }
  };

  return (
    <div className="adm-modal" role="dialog" aria-label="Novo sócio">
      <div className="adm-modal__caixa" style={{ maxWidth: 620 }}>
        <header className="adm-card__head">
          <span className="adm-card__title">Novo sócio</span>
          <button type="button" className="adm-btn" onClick={onFechar} disabled={salvando}>
            Fechar
          </button>
        </header>

        <div className="adm-card__body">
          {erro !== null && <div className="adm-error">{erro}</div>}

          <input
            className="adm-nome-grande"
            id="socio-nome"
            autoFocus
            placeholder="Nome completo do sócio"
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
          />

          <div className="adm-grid adm-grid--2" style={{ marginTop: 20 }}>
            <div>
              <label className="adm-fieldlabel" htmlFor="socio-papel">
                Papel
              </label>
              <select
                id="socio-papel"
                className="adm-input"
                style={entrada}
                value={papel}
                onChange={(evento) => setPapel(evento.target.value)}
              >
                {PAPEIS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="adm-fieldlabel" htmlFor="socio-email">
                E-mail<span className="adm-obrigatorio" aria-hidden="true"> *</span>
              </label>
              <input
                id="socio-email"
                className="adm-input"
                style={entrada}
                type="email"
                value={email}
                onChange={(evento) => setEmail(evento.target.value)}
              />
            </div>
            <div>
              <label className="adm-fieldlabel" htmlFor="socio-cpf">
                CPF<span className="adm-opcional"> · opcional</span>
              </label>
              <input
                id="socio-cpf"
                className="adm-input"
                style={entrada}
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(evento) => setCpf(formatarCpf(evento.target.value))}
              />
            </div>
            <div>
              <label className="adm-fieldlabel" htmlFor="socio-telefone">
                Celular
              </label>
              <input
                id="socio-telefone"
                className="adm-input"
                style={entrada}
                value={telefone}
                onChange={(evento) => setTelefone(evento.target.value)}
              />
            </div>
          </div>

          <div className="adm-painel__ajuda" style={{ marginTop: 16, marginBottom: 0 }}>
            O resto do cadastro — RG, endereço, redes — fica editável no card do
            sócio depois de criado.
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
            <button type="button" className="adm-btn" onClick={onFechar} disabled={salvando}>
              Cancelar
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--primary"
              onClick={() => void salvar()}
              disabled={salvando}
            >
              {salvando ? 'Criando…' : 'Criar sócio'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
