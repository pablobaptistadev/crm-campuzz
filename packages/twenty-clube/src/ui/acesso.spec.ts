import { describe, expect, it } from 'vitest';

import { podeEditarAlgum } from 'src/ui/acesso';

describe('podeEditarAlgum', () => {
  it('o View não edita objeto nenhum e fica só com a leitura', () => {
    expect(
      podeEditarAlgum([{ canUpdateObjectRecords: false }, { canUpdateObjectRecords: false }]),
    ).toBe(false);
  });

  it('basta um objeto editável para as telas mostrarem a edição', () => {
    expect(
      podeEditarAlgum([{ canUpdateObjectRecords: false }, { canUpdateObjectRecords: true }]),
    ).toBe(true);
  });

  // Sem a lista, quem decide é o servidor: esconder tudo por falta de dado
  // travaria quem sempre pôde editar.
  it('sem a lista de permissões, as telas continuam como sempre foram', () => {
    expect(podeEditarAlgum(null)).toBe(true);
    expect(podeEditarAlgum(undefined)).toBe(true);
  });

  it('permissão sem resposta não conta como edição', () => {
    expect(podeEditarAlgum([{ canUpdateObjectRecords: null }])).toBe(false);
  });
});
