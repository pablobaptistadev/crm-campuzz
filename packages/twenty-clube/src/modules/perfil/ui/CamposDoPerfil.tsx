import { useState } from 'react';

import { formatarCpf, type Perfil, type Problema } from '../dominio/Perfil';
import { PerfilInvalido } from '../aplicacao/erros';
import { perfilDoMembro } from '../index';

const erroDe = (problemas: Problema[], campo: keyof Perfil): string | null =>
  problemas.find((problema) => problema.campo === campo)?.mensagem ?? null;

export const CamposDoPerfil = ({
  membroId,
  perfil,
  onSalvo,
}: {
  membroId: string;
  perfil: Perfil;
  onSalvo: (salvo: Perfil) => void;
}) => {
  const [rascunho, setRascunho] = useState<Perfil>(perfil);
  const [problemas, setProblemas] = useState<Problema[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const mudar = (campo: keyof Perfil, valor: string) => {
    setSalvo(false);
    setRascunho((atual) => ({ ...atual, [campo]: valor }));
    setProblemas((atuais) => atuais.filter((problema) => problema.campo !== campo));
  };

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    setProblemas([]);

    try {
      const resultado = await perfilDoMembro.salvar(membroId, rascunho);

      setRascunho(resultado);
      onSalvo(resultado);
      setSalvo(true);
    } catch (causa) {
      if (causa instanceof PerfilInvalido) {
        setProblemas(causa.problemas);
      } else {
        setErro(causa instanceof Error ? causa.message : 'Não conseguimos salvar.');
      }
    } finally {
      setSalvando(false);
    }
  };

  const campo = (
    chave: 'nomeCompleto' | 'email' | 'cpf' | 'miniBio',
    rotulo: string,
    obrigatorio: boolean,
    extras: { placeholder?: string; multilinha?: boolean; formatar?: (v: string) => string } = {},
  ) => {
    const problema = erroDe(problemas, chave);
    const id = `perfil-${chave}-${membroId}`;
    const valor = rascunho[chave] ?? '';

    return (
      <div>
        <label className="adm-fieldlabel" htmlFor={id}>
          {rotulo}
          {obrigatorio ? (
            <span className="adm-obrigatorio" aria-hidden="true"> *</span>
          ) : (
            <span className="adm-opcional"> · opcional</span>
          )}
        </label>
        {extras.multilinha === true ? (
          <textarea
            id={id}
            className="adm-input"
            rows={3}
            style={{ width: '100%' }}
            value={valor}
            placeholder={extras.placeholder}
            onChange={(evento) => mudar(chave, evento.target.value)}
          />
        ) : (
          <input
            id={id}
            className={problema === null ? 'adm-input' : 'adm-input adm-input--erro'}
            style={{ width: '100%' }}
            value={valor}
            placeholder={extras.placeholder}
            aria-invalid={problema !== null}
            aria-describedby={problema === null ? undefined : `${id}-erro`}
            onChange={(evento) =>
              mudar(
                chave,
                extras.formatar === undefined
                  ? evento.target.value
                  : extras.formatar(evento.target.value),
              )
            }
          />
        )}
        {problema !== null && (
          <div className="adm-campo__erro" id={`${id}-erro`}>
            {problema}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="adm-section">
      <div className="adm-grid adm-grid--2">
        {campo('nomeCompleto', 'Nome completo', true, { placeholder: 'Nome e sobrenome' })}
        {campo('email', 'E-mail', true, { placeholder: 'nome@dominio.com.br' })}
        {campo('cpf', 'CPF', false, { placeholder: '000.000.000-00', formatar: formatarCpf })}
      </div>

      <div style={{ marginTop: 14 }}>
        {campo('miniBio', 'Bio', false, {
          multilinha: true,
          placeholder: 'Uma linha sobre quem é este membro.',
        })}
      </div>

      {erro !== null && <div className="adm-error">{erro}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
        <button
          type="button"
          className="adm-btn adm-btn--primary"
          disabled={salvando}
          onClick={() => void salvar()}
        >
          {salvando ? 'Salvando…' : 'Salvar perfil'}
        </button>
        {salvo && <span className="adm-salvo">Salvo</span>}
      </div>
    </div>
  );
};
