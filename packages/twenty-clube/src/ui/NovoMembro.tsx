import { useState } from 'react';

import { gql } from 'src/api/client';
import { CRIAR_ETAPAS, CRIAR_MEMBRO, JORNADA_MEMBRO } from 'src/api/clube-novo';
import { validarPerfil } from 'src/modules/perfil';
import { micros, numeroLimpo } from './parcelas';

const PAPEIS = [
  { value: 'MENTORADO', label: 'Mentorado' },
  { value: 'MENTOR', label: 'Mentor' },
  { value: 'SOCIO', label: 'Sócio' },
  { value: 'CONVIDADO', label: 'Convidado' },
];

const STATUS = [
  { value: 'ATIVO', label: 'Ativo' },
  { value: 'PENDENTE', label: 'Pendente' },
  { value: 'PAUSADO', label: 'Pausado' },
  { value: 'INATIVO', label: 'Inativo' },
];

const entrada = { width: '100%', minWidth: 0 } as const;

export const NovoMembro = ({
  clubeId,
  posicao,
  onFechar,
  onCriado,
}: {
  clubeId: string;
  posicao: number;
  onFechar: () => void;
  onCriado: () => void;
}) => {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [papel, setPapel] = useState('MENTORADO');
  const [situacao, setSituacao] = useState('ATIVO');
  const [entradaEm, setEntradaEm] = useState(new Date().toISOString().slice(0, 10));
  const [nascimento, setNascimento] = useState('');
  const [valorTotal, setValorTotal] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const texto = (valor: string) => (valor.trim() === '' ? null : valor.trim());

  const salvar = async () => {
    // A mesma regra do perfil vale no cadastro: deixar entrar sem e-mail é o
    // que produz os membros que nunca recebem lembrete de parcela.
    const problemas = validarPerfil({
      nomeCompleto: nome,
      email,
      cpf: null,
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

      const membro = await gql<{ createMembro: { id: string } }>(CRIAR_MEMBRO, {
        data: {
          name: nome.trim(),
          nomeCracha: nome.trim(),
          papel,
          situacao,
          entradaEm: texto(entradaEm),
          nascimento: texto(nascimento),
          emails: { primaryEmail: email.trim() },
          telefones:
            digitos.length < 8
              ? null
              : {
                  primaryPhoneNumber: digitos.startsWith('55') ? digitos.slice(2) : digitos,
                  primaryPhoneCallingCode: '+55',
                  primaryPhoneCountryCode: 'BR',
                },
          valorTotal: numeroLimpo(valorTotal) > 0 ? micros(numeroLimpo(valorTotal)) : null,
          contratoSituacao: 'PENDENTE',
          clubeId,
          position: posicao,
        },
      });

      // Sem as etapas o membro abre com a aba CRM vazia, que é justamente a
      // tela que a equipe usa para tocar o onboarding dele.
      await gql(CRIAR_ETAPAS, {
        data: JORNADA_MEMBRO.map((etapa, indice) => ({
          name: etapa,
          ordem: indice + 1,
          escopo: 'MEMBRO',
          situacao: 'PENDENTE',
          membroId: membro.createMembro.id,
          position: indice + 1,
        })),
      });

      onCriado();
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não conseguimos criar o membro.');
      setSalvando(false);
    }
  };

  return (
    <div className="adm-modal" role="dialog" aria-label="Novo membro">
      <div className="adm-modal__caixa">
        <header className="adm-card__head">
          <span className="adm-card__title">Novo membro</span>
          <button type="button" className="adm-btn" onClick={onFechar}>
            Fechar
          </button>
        </header>

        <div className="adm-card__body">
          {erro !== null && <div className="adm-error">{erro}</div>}

          <div className="adm-fieldlabel">Nome completo</div>
          <input
            className="adm-nome-grande"
            autoFocus
            placeholder="Ana Paula Leal Pereira"
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
          />

          <div className="adm-grid adm-grid--2" style={{ marginTop: 20 }}>
            <div>
              <div className="adm-fieldlabel">
                E-mail<span className="adm-obrigatorio" aria-hidden="true"> *</span>
              </div>
              <input
                className="adm-input"
                style={entrada}
                type="email"
                value={email}
                onChange={(evento) => setEmail(evento.target.value)}
              />
            </div>
            <div>
              <div className="adm-fieldlabel">Celular</div>
              <input
                className="adm-input"
                style={entrada}
                type="tel"
                placeholder="(11) 99999-9999"
                value={telefone}
                onChange={(evento) => setTelefone(evento.target.value)}
              />
            </div>
          </div>

          <div className="adm-grid adm-grid--3" style={{ marginTop: 16 }}>
            <div>
              <div className="adm-fieldlabel">Papel</div>
              <select
                className="adm-input"
                style={entrada}
                value={papel}
                onChange={(evento) => setPapel(evento.target.value)}
              >
                {PAPEIS.map((opcao) => (
                  <option key={opcao.value} value={opcao.value}>
                    {opcao.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="adm-fieldlabel">Status</div>
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
            </div>
            <div>
              <div className="adm-fieldlabel">Entrou em</div>
              <input
                className="adm-input"
                style={entrada}
                type="date"
                value={entradaEm}
                onChange={(evento) => setEntradaEm(evento.target.value)}
              />
            </div>
          </div>

          <div className="adm-grid adm-grid--2" style={{ marginTop: 16 }}>
            <div>
              <div className="adm-fieldlabel">Data de nascimento</div>
              <input
                className="adm-input"
                style={entrada}
                type="date"
                value={nascimento}
                onChange={(evento) => setNascimento(evento.target.value)}
              />
            </div>
            <div>
              <div className="adm-fieldlabel">Valor do contrato (R$)</div>
              <input
                className="adm-input"
                style={entrada}
                inputMode="decimal"
                value={valorTotal}
                onChange={(evento) => setValorTotal(evento.target.value)}
              />
            </div>
          </div>

          <div className="adm-painel__ajuda" style={{ marginTop: 16, marginBottom: 0 }}>
            O membro já nasce com as {JORNADA_MEMBRO.length} etapas da jornada.
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
              {salvando ? 'Criando…' : 'Adicionar membro'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
