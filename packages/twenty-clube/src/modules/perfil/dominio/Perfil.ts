// Camada de domínio: sem React, sem fetch, sem GraphQL. O que está aqui é a
// regra do negócio e roda igual no navegador, no teste e num script.

export type Perfil = {
  nomeCompleto: string;
  email: string;
  cpf: string | null;
  miniBio: string | null;
  fotoUrl: string | null;
};

export type CampoDoPerfil = keyof Perfil;

export type Problema = { campo: CampoDoPerfil; mensagem: string };

const soDigitos = (valor: string): string => valor.replace(/\D/g, '');

// Um CPF tem dois dígitos verificadores calculados sobre os nove primeiros.
// Repetição total (111.111.111-11) passa na conta e por isso é barrada à parte.
export const cpfEhValido = (entrada: string): boolean => {
  const digitos = soDigitos(entrada);

  if (digitos.length !== 11 || /^(\d)\1{10}$/.test(digitos)) {
    return false;
  }

  const verificador = (ate: number): number => {
    let soma = 0;

    for (let posicao = 0; posicao < ate; posicao += 1) {
      soma += Number(digitos[posicao]) * (ate + 1 - posicao);
    }

    const resto = (soma * 10) % 11;

    return resto === 10 ? 0 : resto;
  };

  return verificador(9) === Number(digitos[9]) && verificador(10) === Number(digitos[10]);
};

export const formatarCpf = (entrada: string): string => {
  const digitos = soDigitos(entrada).slice(0, 11);

  return digitos
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
};

// Não é validação de RFC: é a checagem que separa um endereço digitado errado
// de um que o SendGrid consegue tentar entregar.
const emailEhPlausivel = (valor: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor.trim());

export const validarPerfil = (perfil: Perfil): Problema[] => {
  const problemas: Problema[] = [];
  const nome = perfil.nomeCompleto.trim();

  if (nome === '') {
    problemas.push({ campo: 'nomeCompleto', mensagem: 'Precisamos do nome completo.' });
  } else if (!/\s/.test(nome)) {
    // É o campo do nome completo, não do primeiro nome: sem sobrenome, dois
    // membros com o mesmo primeiro nome viram a mesma pessoa na lista.
    problemas.push({
      campo: 'nomeCompleto',
      mensagem: 'Falta o sobrenome — escreva o nome completo.',
    });
  }

  if (perfil.email.trim() === '') {
    problemas.push({
      campo: 'email',
      mensagem: 'Precisamos do e-mail: é para onde vão os lembretes de pagamento.',
    });
  } else if (!emailEhPlausivel(perfil.email)) {
    problemas.push({ campo: 'email', mensagem: 'Este e-mail não parece completo.' });
  }

  // O CPF é opcional. Vazio passa; preenchido errado, não — guardar um CPF
  // inválido é pior do que não ter nenhum.
  if (perfil.cpf !== null && perfil.cpf.trim() !== '' && !cpfEhValido(perfil.cpf)) {
    problemas.push({ campo: 'cpf', mensagem: 'Este CPF não confere.' });
  }

  return problemas;
};

export const perfilEstaCompleto = (perfil: Perfil): boolean =>
  validarPerfil(perfil).length === 0;
