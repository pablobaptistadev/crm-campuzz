export type ResultadoDoLote<TItem> = { feitos: number; falhas: TItem[] };

// Roda a tarefa em cada item com no máximo `simultaneos` ao mesmo tempo. Uma
// falha não para o resto: num "aplicar a todos" de 160 etapas, parar na 40ª
// deixaria metade aplicada sem ninguém saber qual metade. Quem falhou volta
// na lista para tentar de novo.
export const emLotes = async <TItem>(
  itens: readonly TItem[],
  simultaneos: number,
  tarefa: (item: TItem) => Promise<unknown>,
  aoAvancar?: (feitos: number, falhas: number) => void,
): Promise<ResultadoDoLote<TItem>> => {
  const falhas: TItem[] = [];
  let feitos = 0;
  let proximo = 0;

  const trabalhador = async () => {
    while (proximo < itens.length) {
      const item = itens[proximo];

      proximo += 1;

      try {
        await tarefa(item);
        feitos += 1;
      } catch {
        falhas.push(item);
      }

      aoAvancar?.(feitos, falhas.length);
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(simultaneos, itens.length)) }, trabalhador),
  );

  return { feitos, falhas };
};
