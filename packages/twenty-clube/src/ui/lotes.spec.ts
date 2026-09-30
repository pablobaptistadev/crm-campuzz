import { describe, expect, it } from 'vitest';

import { emLotes } from 'src/ui/lotes';

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

describe('tarefas em lotes', () => {
  it('roda todos os itens sem passar do limite ao mesmo tempo', async () => {
    let emVoo = 0;
    let pico = 0;
    const vistos: number[] = [];

    const resultado = await emLotes(
      Array.from({ length: 20 }, (_, indice) => indice),
      6,
      async (item) => {
        emVoo += 1;
        pico = Math.max(pico, emVoo);
        await esperar(2);
        vistos.push(item);
        emVoo -= 1;
      },
    );

    expect(resultado).toEqual({ feitos: 20, falhas: [] });
    expect(pico).toBeLessThanOrEqual(6);
    expect([...vistos].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, indice) => indice));
  });

  it('continua depois de uma falha e devolve quem falhou', async () => {
    const avancos: [number, number][] = [];

    const resultado = await emLotes(
      ['a', 'b', 'c', 'd'],
      2,
      async (item) => {
        if (item === 'b') {
          throw new Error('caiu');
        }
      },
      (feitos, falhas) => avancos.push([feitos, falhas]),
    );

    expect(resultado).toEqual({ feitos: 3, falhas: ['b'] });
    expect(avancos.at(-1)).toEqual([3, 1]);
  });

  it('não roda nada com a lista vazia', async () => {
    expect(await emLotes([], 6, async () => undefined)).toEqual({ feitos: 0, falhas: [] });
  });
});
