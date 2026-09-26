import { describe, expect, it } from 'vitest';

import { cpfEhValido, formatarCpf, validarPerfil, type Perfil } from './Perfil';

const base: Perfil = {
  nomeCompleto: 'Ana Paula Leal Pereira',
  email: 'ana@exemplo.com.br',
  cpf: null,
  miniBio: null,
  fotoUrl: null,
};

const camposComProblema = (perfil: Perfil) =>
  validarPerfil(perfil).map((problema) => problema.campo);

describe('validação do perfil', () => {
  it('aceita nome completo e e-mail, com CPF vazio', () => {
    expect(validarPerfil(base)).toEqual([]);
    expect(validarPerfil({ ...base, cpf: '' })).toEqual([]);
  });

  it('exige o nome', () => {
    expect(camposComProblema({ ...base, nomeCompleto: '   ' })).toEqual(['nomeCompleto']);
  });

  // É o campo do nome completo: "Ana" sozinho não distingue duas Anas do clube.
  it('exige sobrenome, não só o primeiro nome', () => {
    expect(camposComProblema({ ...base, nomeCompleto: 'Ana' })).toEqual(['nomeCompleto']);
  });

  it('exige e-mail, porque é para onde vai o lembrete', () => {
    expect(camposComProblema({ ...base, email: '' })).toEqual(['email']);
    expect(camposComProblema({ ...base, email: 'ana@' })).toEqual(['email']);
    expect(camposComProblema({ ...base, email: 'ana@exemplo' })).toEqual(['email']);
  });

  it('deixa o CPF opcional, mas recusa um inválido', () => {
    expect(camposComProblema({ ...base, cpf: null })).toEqual([]);
    expect(camposComProblema({ ...base, cpf: '111.111.111-11' })).toEqual(['cpf']);
    expect(camposComProblema({ ...base, cpf: '529.982.247-25' })).toEqual([]);
  });

  it('junta os problemas em vez de parar no primeiro', () => {
    expect(camposComProblema({ ...base, nomeCompleto: '', email: '', cpf: '123' })).toEqual([
      'nomeCompleto',
      'email',
      'cpf',
    ]);
  });
});

describe('CPF', () => {
  it('confere os dois dígitos verificadores', () => {
    expect(cpfEhValido('529.982.247-25')).toBe(true);
    expect(cpfEhValido('52998224725')).toBe(true);
    expect(cpfEhValido('529.982.247-26')).toBe(false);
  });

  // Todos os dígitos iguais passam na conta dos verificadores e mesmo assim
  // não são CPF de ninguém.
  it('recusa dígitos repetidos', () => {
    for (const repetido of ['00000000000', '11111111111', '99999999999']) {
      expect(cpfEhValido(repetido)).toBe(false);
    }
  });

  it('recusa comprimento errado', () => {
    expect(cpfEhValido('5299822472')).toBe(false);
    expect(cpfEhValido('529982247250')).toBe(false);
  });

  it('formata conforme a pessoa digita', () => {
    expect(formatarCpf('529')).toBe('529');
    expect(formatarCpf('529982')).toBe('529.982');
    expect(formatarCpf('529982247')).toBe('529.982.247');
    expect(formatarCpf('52998224725')).toBe('529.982.247-25');
    expect(formatarCpf('529982247259999')).toBe('529.982.247-25');
  });
});
