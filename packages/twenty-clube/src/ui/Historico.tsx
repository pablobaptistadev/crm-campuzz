import { dataHora, dinheiroCurto, enderecoLinha, telefone } from './format';
import { Vazio, rotuloDe } from './primitives';

type Linha = {
  id: string;
  name: string;
  happensAt: string | null;
  createdAt: string | null;
  properties: { diff?: Record<string, { before: unknown; after: unknown }> } | null;
};

const ACAO: Record<string, string> = {
  created: 'Criado',
  updated: 'Atualizado',
  deleted: 'Excluído',
  restored: 'Restaurado',
};

// Um composto sai do banco como objeto; imprimir o JSON cru transforma a linha
// do histórico em ruído, então cada forma conhecida vira o texto que a ficha
// mostraria.
const valor = (bruto: unknown): string => {
  if (bruto === null || bruto === undefined || bruto === '') {
    return '—';
  }

  if (typeof bruto !== 'object') {
    return rotuloDe(String(bruto));
  }

  const campos = bruto as Record<string, unknown>;

  if ('primaryPhoneNumber' in campos) {
    return telefone(campos as never);
  }

  if ('primaryEmail' in campos) {
    return String(campos.primaryEmail ?? '—');
  }

  if ('primaryLinkUrl' in campos) {
    return String(campos.primaryLinkLabel ?? campos.primaryLinkUrl ?? '—');
  }

  if ('amountMicros' in campos) {
    return dinheiroCurto(campos as never);
  }

  if ('addressStreet1' in campos) {
    return enderecoLinha(campos as never);
  }

  return Object.values(campos)
    .filter((parte) => parte !== null && parte !== undefined && parte !== '')
    .map(String)
    .join(' · ');
};

const ROTULO_CAMPO: Record<string, string> = {
  situacao: 'Status',
  telefones: 'Telefone',
  telefoneFixo: 'Telefone fixo',
  emails: 'E-mail',
  endereco: 'Endereço',
  valorTotal: 'Valor total',
  capitalNegociado: 'Capital negociado',
  contratoSituacao: 'Contrato',
  mouSituacao: 'MOU',
  concluidaEm: 'Concluída em',
  nascimento: 'Nascimento',
  camiseta: 'Camiseta',
  papel: 'Papel',
  nomeCracha: 'Nome no crachá',
};

export const Historico = ({ linhas }: { linhas: Linha[] }) => {
  if (linhas.length === 0) {
    return <Vazio>Ainda não há atividade neste registro.</Vazio>;
  }

  return (
    <div>
      {linhas.map((linha) => {
        const diff = Object.entries(linha.properties?.diff ?? {});

        return (
          <div className="adm-step" key={linha.id}>
            <span className="adm-step__label">
              <strong>{ACAO[linha.name] ?? linha.name}</strong>
              {diff.length > 0 && (
                <span className="adm-table__sub" style={{ display: 'block' }}>
                  {diff
                    .map(
                      ([campo, mudanca]) =>
                        `${ROTULO_CAMPO[campo] ?? campo}: ${valor(mudanca.before)} → ${valor(mudanca.after)}`,
                    )
                    .join(' · ')}
                </span>
              )}
            </span>
            <span className="adm-step__state">{dataHora(linha.happensAt ?? linha.createdAt)}</span>
          </div>
        );
      })}
    </div>
  );
};
