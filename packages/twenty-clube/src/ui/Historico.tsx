import { useState } from 'react';

import { gql } from 'src/api/client';
import { LINHA_DO_TEMPO } from 'src/api/queries';
import { AvatarDoMembro } from 'src/modules/perfil/ui/AvatarDoMembro';
import { type Autor, useAutores } from './autores';
import { dataHora, dinheiroCurto, enderecoLinha, telefone } from './format';
import { Vazio, rotuloDe } from './primitives';

type Linha = {
  id: string;
  name: string;
  happensAt: string | null;
  createdAt: string | null;
  workspaceMemberId?: string | null;
  properties: {
    diff?: Record<string, { before: unknown; after: unknown }>;
    texto?: string;
  } | null;
};

// A anotação é escrita por uma pessoa; o resto da linha do tempo é o registro
// do que o sistema fez. Só a anotação pode ser apagada — apagar as outras
// seria reescrever o que aconteceu.
const NOTA = 'nota';

const CRIAR_NOTA = `
  mutation CriarNota($data: TimelineActivityCreateInput!) {
    createTimelineActivity(data: $data) { ${LINHA_DO_TEMPO} }
  }
`;

const nomeDoAutor = (autor: Autor | null | undefined): string | null => {
  if (autor === null || autor === undefined) {
    return null;
  }

  const nome = [autor.name?.firstName, autor.name?.lastName]
    .filter((parte) => parte !== null && parte !== undefined && parte.trim() !== '')
    .join(' ')
    .trim();

  return nome === '' ? 'Usuário sem nome' : nome;
};

const REMOVER_NOTA = `
  mutation RemoverNota($id: UUID!) {
    destroyTimelineActivity(id: $id) { id }
  }
`;

const ACAO: Record<string, string> = {
  created: 'Criado',
  updated: 'Atualizado',
  deleted: 'Excluído',
  restored: 'Restaurado',
  [NOTA]: 'Anotação',
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

export const Historico = ({
  linhas,
  campoAlvo,
  alvoId,
  onMudou,
}: {
  linhas: Linha[];
  // Sem o alvo o histórico continua só de leitura, que é como ele aparece
  // dentro de telas que não têm um registro único para anotar.
  campoAlvo?: string;
  alvoId?: string;
  onMudou?: (proximas: Linha[]) => void;
}) => {
  const autores = useAutores();
  const autorDe = (linha: Linha): Autor | null =>
    linha.workspaceMemberId === null || linha.workspaceMemberId === undefined
      ? null
      : (autores?.get(linha.workspaceMemberId) ?? null);
  const [texto, setTexto] = useState('');
  const [quandoAconteceu, setQuandoAconteceu] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const podeAnotar = campoAlvo !== undefined && alvoId !== undefined && onMudou !== undefined;

  const anotar = async () => {
    if (!podeAnotar || texto.trim() === '') {
      setErro('Escreva a anotação.');

      return;
    }

    setOcupado(true);
    setErro(null);

    try {
      const criada = await gql<{ createTimelineActivity: Linha }>(CRIAR_NOTA, {
        data: {
          name: NOTA,
          // Uma conversa de ontem anotada hoje pertence a ontem: sem a data
          // escolhida, a linha do tempo conta a história na ordem errada.
          happensAt:
            quandoAconteceu === ''
              ? new Date().toISOString()
              : new Date(`${quandoAconteceu}T12:00:00`).toISOString(),
          properties: { texto: texto.trim() },
          [campoAlvo]: alvoId,
          position: 'last',
        },
      });

      onMudou([...linhas, criada.createTimelineActivity]);
      setTexto('');
      setQuandoAconteceu('');
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não conseguimos anotar.');
    } finally {
      setOcupado(false);
    }
  };

  const remover = async (linha: Linha) => {
    if (!podeAnotar) {
      return;
    }

    setOcupado(true);

    try {
      await gql(REMOVER_NOTA, { id: linha.id });
      onMudou(linhas.filter((item) => item.id !== linha.id));
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não conseguimos remover.');
    } finally {
      setOcupado(false);
    }
  };

  // A relação não aceita orderBy, então a ordem vem da posição da linha, não do
  // relógio — e um histórico fora de ordem cronológica não é um histórico.
  const quando = (linha: Linha) =>
    new Date(linha.happensAt ?? linha.createdAt ?? 0).getTime();
  const ordenadas = [...linhas].sort((a, b) => quando(b) - quando(a));

  return (
    <div>
      {podeAnotar && (
        <div className="adm-nota">
          <input
            className="adm-input adm-nota__texto"
            placeholder="Anotar no histórico: ligação, reunião, combinado…"
            aria-label="Nova anotação"
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === 'Enter') {
                void anotar();
              }
            }}
          />
          <input
            className="adm-input"
            type="date"
            aria-label="Data da anotação"
            title="Quando aconteceu (em branco = agora)"
            value={quandoAconteceu}
            onChange={(evento) => setQuandoAconteceu(evento.target.value)}
          />
          <button
            type="button"
            className="adm-btn adm-btn--primary adm-btn--pequeno"
            disabled={ocupado}
            onClick={() => void anotar()}
          >
            {ocupado ? 'Salvando…' : 'Anotar'}
          </button>
        </div>
      )}

      {erro !== null && <div className="adm-error">{erro}</div>}

      {ordenadas.length === 0 ? (
        <Vazio>Ainda não há atividade neste registro.</Vazio>
      ) : (
        ordenadas.map((linha) => {
          const diff = Object.entries(linha.properties?.diff ?? {});
          const ehNota = linha.name === NOTA;

          return (
            <div className={ehNota ? 'adm-step adm-step--nota' : 'adm-step'} key={linha.id}>
              <span className="adm-step__label">
                <strong>{ACAO[linha.name] ?? linha.name}</strong>
                {ehNota && linha.properties?.texto !== undefined && (
                  <span className="adm-step__nota">{linha.properties.texto}</span>
                )}
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
              <span className="adm-step__autor">
                {linha.workspaceMemberId !== null &&
                linha.workspaceMemberId !== undefined &&
                autores === null ? (
                  // Autor conhecido, lista de autores ainda a caminho: dizer
                  // "não registrado" nesse meio-tempo seria afirmar algo falso.
                  <span className="adm-step__quem adm-step__quem--sem">…</span>
                ) : nomeDoAutor(autorDe(linha)) === null ? (
                  // Linhas de antes do carimbo de autoria: dizer que não se sabe
                  // é honesto; deixar em branco parece que foi o sistema.
                  <span className="adm-step__quem adm-step__quem--sem">
                    Autor não registrado
                  </span>
                ) : (
                  <>
                    <AvatarDoMembro
                      nome={nomeDoAutor(autorDe(linha)) ?? ''}
                      fotoUrl={autorDe(linha)?.avatarUrl ?? null}
                      tamanho="linha"
                      vazio="iniciais"
                    />
                    <span className="adm-step__quem">
                      {nomeDoAutor(autorDe(linha))}
                    </span>
                  </>
                )}
                <span className="adm-step__state">
                  {dataHora(linha.happensAt ?? linha.createdAt)}
                </span>
              </span>
              {ehNota && podeAnotar && (
                <button
                  type="button"
                  className="adm-btn adm-btn--perigo adm-btn--pequeno"
                  disabled={ocupado}
                  onClick={() => void remover(linha)}
                >
                  Remover
                </button>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};
