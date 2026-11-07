import { UserFacingError } from 'src/graphql/user-facing-error';

export const MENSAGEM_HISTORICO_IMUTAVEL =
  'O histórico não pode ser alterado nem apagado.';

// O histórico é a prova de quem fez o quê. Se uma linha pudesse ser reescrita
// ou apagada por quem tem sessão, deixaria de provar qualquer coisa — por isso
// só acrescentar é permitido, para todo papel. Os eventos automáticos e a
// cascata de arquivar ou apagar o registro dono são SQL do próprio servidor
// (src/services/timeline.ts, src/services/cascata.ts) e não passam por aqui.
export const ehHistorico = (nomeDoObjeto: string): boolean =>
  nomeDoObjeto === 'timelineActivity';

export const recusarSeForHistorico = (nomeDoObjeto: string): void => {
  if (ehHistorico(nomeDoObjeto)) {
    throw new UserFacingError(MENSAGEM_HISTORICO_IMUTAVEL, 'FORBIDDEN');
  }
};
