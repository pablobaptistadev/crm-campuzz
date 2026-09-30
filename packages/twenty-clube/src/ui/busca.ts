// Sem acento e sem caixa: quem procura "sergio" tem de achar "Sérgio", senão a
// busca só serve para quem já sabe escrever o nome do jeito que foi cadastrado.
// Mora aqui para a busca do painel e o filtro da lista de membros concordarem
// sobre o que é "o mesmo nome".
export const comparavel = (valor: string): string =>
  valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

// Quanto menor, mais acima: começar pelo termo vale mais que só contê-lo, e o
// nome vale mais que o e-mail. Sem isto, buscar "ana" poria a "Luciana" antes
// da "Ana Paula".
export const pesoDaBusca = (
  termo: string,
  campos: readonly (string | null | undefined)[],
): number | null => {
  const alvo = comparavel(termo);

  if (alvo === '') {
    return null;
  }

  let melhor: number | null = null;

  campos.forEach((campo, posicao) => {
    if (campo === null || campo === undefined) {
      return;
    }

    const texto = comparavel(campo);
    const palavras = texto.split(/[\s@._-]+/);

    const peso = texto.startsWith(alvo)
      ? 0
      : palavras.some((palavra) => palavra.startsWith(alvo))
        ? 1
        : texto.includes(alvo)
          ? 2
          : null;

    if (peso === null) {
      return;
    }

    // Três níveis por campo: o primeiro campo sempre ganha do segundo.
    const pesoFinal = posicao * 3 + peso;

    if (melhor === null || pesoFinal < melhor) {
      melhor = pesoFinal;
    }
  });

  return melhor;
};

export const casaComABusca = (
  termo: string,
  campos: readonly (string | null | undefined)[],
): boolean => comparavel(termo) === '' || pesoDaBusca(termo, campos) !== null;

export type AlunoBuscavel = {
  id: string;
  name: string | null;
  emails: { primaryEmail: string | null } | null;
  emailFinanceiro?: string | null;
};

export type ClubeBuscavel = {
  id: string;
  name: string;
  mentor: string | null;
};

const ordenarPorPeso = <TItem>(
  itens: readonly TItem[],
  termo: string,
  camposDe: (item: TItem) => readonly (string | null | undefined)[],
  nomeDe: (item: TItem) => string,
): TItem[] =>
  itens
    .map((item) => ({ item, peso: pesoDaBusca(termo, camposDe(item)) }))
    .filter((par): par is { item: TItem; peso: number } => par.peso !== null)
    .sort((a, b) => a.peso - b.peso || nomeDe(a.item).localeCompare(nomeDe(b.item), 'pt-BR'))
    .map((par) => par.item);

export const buscarNoPainel = <TAluno extends AlunoBuscavel, TClube extends ClubeBuscavel>(
  termo: string,
  alunos: readonly TAluno[],
  clubes: readonly TClube[],
): { alunos: TAluno[]; clubes: TClube[] } => {
  if (comparavel(termo) === '') {
    return { alunos: [], clubes: [...clubes] };
  }

  return {
    alunos: ordenarPorPeso(
      alunos,
      termo,
      (aluno) => [aluno.name, aluno.emails?.primaryEmail, aluno.emailFinanceiro],
      (aluno) => aluno.name ?? '',
    ),
    clubes: ordenarPorPeso(
      clubes,
      termo,
      (clube) => [clube.name, clube.mentor],
      (clube) => clube.name,
    ),
  };
};
