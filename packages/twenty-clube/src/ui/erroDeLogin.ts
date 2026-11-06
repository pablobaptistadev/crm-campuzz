// O servidor devolve o código em inglês (INVALID_CREDENTIALS, TOO_MANY_ATTEMPTS),
// e é o código que decide a mensagem: senha errada não pode aparecer como falha
// do sistema, senão quem errou a senha fica tentando de novo a mesma senha.
export const mensagemDeErroDeLogin = (mensagemDoServidor: string | null): string => {
  if (mensagemDoServidor !== null && /credenc|credential|password|senha/i.test(mensagemDoServidor)) {
    return 'E-mail ou senha incorretos.';
  }

  if (mensagemDoServidor !== null && /too_many_attempts|tentativas/i.test(mensagemDoServidor)) {
    return 'Muitas tentativas seguidas com este e-mail. Espere 10 minutos e tente de novo.';
  }

  return 'Não conseguimos entrar. Tente de novo em instantes.';
};
