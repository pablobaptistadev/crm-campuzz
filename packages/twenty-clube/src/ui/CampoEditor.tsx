import { type CampoMeta } from 'src/api/metadata';
import {
  TRACO,
  dataCurta,
  dinheiro,
  enderecoLinha,
  telefone,
  texto,
} from './format';
import { Chip } from './primitives';

// Uma edição em andamento é sempre o valor cru do campo; só na hora de salvar
// ele volta para a forma que a API espera.
export type Rascunho = Record<string, unknown>;

const comoTexto = (valor: unknown): string =>
  valor === null || valor === undefined ? '' : String(valor);

export const valorParaLeitura = (campo: CampoMeta, valor: unknown) => {
  switch (campo.type) {
    case 'SELECT':
      return <Chip valor={valor === null || valor === undefined ? null : String(valor)} />;
    case 'BOOLEAN':
      return valor === true ? 'Sim' : valor === false ? 'Não' : TRACO;
    case 'DATE':
    case 'DATE_TIME':
      return dataCurta(valor as string | null);
    case 'CURRENCY':
      return dinheiro(valor as never);
    case 'EMAILS':
      return texto((valor as { primaryEmail?: string } | null)?.primaryEmail);
    case 'PHONES':
      return telefone(valor as never);
    case 'LINKS': {
      const link = valor as { primaryLinkUrl?: string; primaryLinkLabel?: string } | null;

      return link?.primaryLinkUrl === undefined || link.primaryLinkUrl === null ? (
        TRACO
      ) : (
        <a
          href={link.primaryLinkUrl}
          target="_blank"
          rel="noreferrer"
          style={{ color: 'var(--gold-deep)' }}
        >
          {link.primaryLinkLabel ?? link.primaryLinkUrl}
        </a>
      );
    }
    case 'ADDRESS':
      return enderecoLinha(valor as never);
    default:
      return texto(comoTexto(valor));
  }
};

// O que o input mostra, a partir do valor guardado.
export const valorParaInput = (campo: CampoMeta, valor: unknown): string => {
  switch (campo.type) {
    case 'DATE':
    case 'DATE_TIME':
      return valor === null || valor === undefined ? '' : String(valor).slice(0, 10);
    case 'CURRENCY': {
      const micros = (valor as { amountMicros?: number | null } | null)?.amountMicros;

      return micros === null || micros === undefined ? '' : String(Number(micros) / 1_000_000);
    }
    case 'EMAILS':
      return comoTexto((valor as { primaryEmail?: string } | null)?.primaryEmail);
    case 'PHONES': {
      const fone = valor as
        | { primaryPhoneCallingCode?: string; primaryPhoneNumber?: string }
        | null;

      return `${fone?.primaryPhoneCallingCode ?? ''}${fone?.primaryPhoneNumber ?? ''}`;
    }
    case 'LINKS':
      return comoTexto((valor as { primaryLinkUrl?: string } | null)?.primaryLinkUrl);
    default:
      return comoTexto(valor);
  }
};

const PAISES: Record<string, string> = {
  '55': 'BR',
  '351': 'PT',
  '1': 'US',
  '44': 'GB',
  '34': 'ES',
  '39': 'IT',
};

// O que vai para a API, a partir do que a pessoa digitou. Um campo esvaziado
// volta como null — string vazia num tipo composto é escrita, não limpeza.
export const valorParaApi = (campo: CampoMeta, bruto: string): unknown => {
  const limpo = bruto.trim();

  if (limpo === '') {
    return null;
  }

  switch (campo.type) {
    case 'CURRENCY': {
      const numero = Number(limpo.replace(/\./g, '').replace(',', '.'));

      return Number.isFinite(numero)
        ? { amountMicros: Math.round(numero * 1_000_000), currencyCode: 'BRL' }
        : null;
    }
    case 'NUMBER':
    case 'NUMERIC': {
      const numero = Number(limpo.replace(',', '.'));

      return Number.isFinite(numero) ? numero : null;
    }
    case 'EMAILS':
      return { primaryEmail: limpo };
    case 'PHONES': {
      const digitos = limpo.replace(/\D/g, '');

      for (const codigo of ['351', '55', '44', '34', '39', '1']) {
        if (digitos.startsWith(codigo) && digitos.length - codigo.length >= 8) {
          return {
            primaryPhoneNumber: digitos.slice(codigo.length),
            primaryPhoneCallingCode: `+${codigo}`,
            primaryPhoneCountryCode: PAISES[codigo],
          };
        }
      }

      return {
        primaryPhoneNumber: digitos,
        primaryPhoneCallingCode: '+55',
        primaryPhoneCountryCode: 'BR',
      };
    }
    case 'LINKS': {
      const url = /^https?:\/\//i.test(limpo) ? limpo : `https://${limpo}`;

      return { primaryLinkUrl: url, primaryLinkLabel: limpo.replace(/^https?:\/\//i, '') };
    }
    default:
      return limpo;
  }
};

export const CampoEditor = ({
  campo,
  valor,
  onChange,
}: {
  campo: CampoMeta;
  valor: unknown;
  onChange: (proximo: unknown) => void;
}) => {
  if (campo.type === 'BOOLEAN') {
    return (
      <select
        className="adm-input"
        style={{ width: '100%', minWidth: 0 }}
        value={valor === true ? 'sim' : valor === false ? 'nao' : ''}
        onChange={(evento) =>
          onChange(evento.target.value === '' ? null : evento.target.value === 'sim')
        }
      >
        <option value="">—</option>
        <option value="sim">Sim</option>
        <option value="nao">Não</option>
      </select>
    );
  }

  if (campo.type === 'SELECT') {
    return (
      <select
        className="adm-input"
        style={{ width: '100%', minWidth: 0 }}
        value={valor === null || valor === undefined ? '' : String(valor)}
        onChange={(evento) => onChange(evento.target.value === '' ? null : evento.target.value)}
      >
        <option value="">—</option>
        {(campo.options ?? []).map((opcao) => (
          <option key={opcao.value} value={opcao.value}>
            {opcao.label}
          </option>
        ))}
      </select>
    );
  }

  if (campo.type === 'ADDRESS') {
    const endereco = (valor ?? {}) as Record<string, string | null>;
    const parte = (chave: string, rotulo: string) => (
      <input
        key={chave}
        className="adm-input"
        style={{ width: '100%', minWidth: 0 }}
        placeholder={rotulo}
        value={endereco[chave] ?? ''}
        onChange={(evento) =>
          onChange({ ...endereco, [chave]: evento.target.value === '' ? null : evento.target.value })
        }
      />
    );

    return (
      <div style={{ display: 'grid', gap: 6 }}>
        {parte('addressStreet1', 'Logradouro e número')}
        {parte('addressStreet2', 'Complemento e bairro')}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 6 }}>
          {parte('addressCity', 'Cidade')}
          {parte('addressState', 'UF')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {parte('addressPostcode', 'CEP')}
          {parte('addressCountry', 'País')}
        </div>
      </div>
    );
  }

  const tipoInput =
    campo.type === 'DATE' || campo.type === 'DATE_TIME'
      ? 'date'
      : campo.type === 'EMAILS'
        ? 'email'
        : campo.type === 'PHONES'
          ? 'tel'
          : campo.type === 'CURRENCY' || campo.type === 'NUMBER' || campo.type === 'NUMERIC'
            ? 'text'
            : 'text';

  return (
    <input
      className="adm-input"
      style={{ width: '100%', minWidth: 0 }}
      type={tipoInput}
      value={valorParaInput(campo, valor)}
      onChange={(evento) => onChange(valorParaApi(campo, evento.target.value))}
    />
  );
};
