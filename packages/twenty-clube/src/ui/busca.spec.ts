import { describe, expect, it } from 'vitest';

import { buscarNoPainel, casaComABusca, comparavel } from 'src/ui/busca';

const aluno = (id: string, name: string, email: string | null, emailFinanceiro: string | null = null) => ({
  id,
  name,
  emails: { primaryEmail: email },
  emailFinanceiro,
});

const clube = (id: string, name: string, mentor: string | null) => ({ id, name, mentor });

const ALUNOS = [
  aluno('a1', 'Luciana Prado', 'lu@exemplo.com'),
  aluno('a2', 'Ana Paula Leal Pereira', 'contato@pablobaptista.com.br'),
  aluno('a3', 'Sérgio Henrique ibanez', 'sergio@catarinaco.com.br'),
  aluno('a4', 'Talita Mazzi', 'antigo@x.com', 'talita@materialpedagogico.com.br'),
];

const CLUBES = [
  clube('c1', 'Teste apis', 'Komatsu'),
  clube('c2', 'Legacy Mind Club', 'Mayara Sousa Santos Marinov'),
  clube('c3', 'Metanoia Club', 'Talita Mazzi Guimarães'),
];

describe('comparavel', () => {
  it('tira acento e caixa', () => {
    expect(comparavel('  SÉRGIO Guimarães ')).toBe('sergio guimaraes');
  });
});

describe('busca do painel', () => {
  it('acha aluno por nome sem acento', () => {
    expect(buscarNoPainel('sergio', ALUNOS, CLUBES).alunos.map((a) => a.id)).toEqual(['a3']);
  });

  it('acha aluno por pedaço do e-mail', () => {
    expect(buscarNoPainel('catarinaco', ALUNOS, CLUBES).alunos.map((a) => a.id)).toEqual(['a3']);
  });

  // Quem trocou de e-mail só é achado pelo endereço novo, que mora no financeiro.
  it('acha aluno pelo e-mail financeiro', () => {
    expect(buscarNoPainel('materialpedagogico', ALUNOS, CLUBES).alunos.map((a) => a.id)).toEqual(['a4']);
  });

  // "ana" tem de trazer a Ana Paula antes da Luciana.
  it('põe quem começa pelo termo antes de quem só o contém', () => {
    expect(buscarNoPainel('ana', ALUNOS, CLUBES).alunos.map((a) => a.id)).toEqual(['a2', 'a1']);
  });

  it('acha clube pelo nome e pelo mentor', () => {
    expect(buscarNoPainel('komatsu', ALUNOS, CLUBES).clubes.map((c) => c.id)).toEqual(['c1']);
    expect(buscarNoPainel('legacy', ALUNOS, CLUBES).clubes.map((c) => c.id)).toEqual(['c2']);
  });

  it('um termo pode achar aluno e clube ao mesmo tempo', () => {
    const achados = buscarNoPainel('talita', ALUNOS, CLUBES);

    expect(achados.alunos.map((a) => a.id)).toEqual(['a4']);
    expect(achados.clubes.map((c) => c.id)).toEqual(['c3']);
  });

  it('nome do clube vale mais que o mentor', () => {
    const lista = [clube('x', 'Outro', 'Club Master'), clube('y', 'Club Alfa', null)];

    expect(buscarNoPainel('club', [], lista).clubes.map((c) => c.id)).toEqual(['y', 'x']);
  });

  it('busca vazia não lista aluno nenhum e devolve todos os clubes', () => {
    const achados = buscarNoPainel('   ', ALUNOS, CLUBES);

    expect(achados.alunos).toEqual([]);
    expect(achados.clubes).toHaveLength(3);
  });

  it('não quebra com aluno sem nome nem e-mail', () => {
    const sem = [{ id: 'z', name: null, emails: null }];

    expect(buscarNoPainel('qualquer', sem, []).alunos).toEqual([]);
  });
});

describe('casaComABusca', () => {
  it('termo vazio casa com tudo', () => {
    expect(casaComABusca('', [null])).toBe(true);
  });
});
