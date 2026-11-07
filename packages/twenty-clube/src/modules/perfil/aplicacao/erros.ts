import { type Problema } from '../dominio/Perfil';

// Um erro de preenchimento não é falha de sistema: ele sabe de qual campo veio,
// para a tela poder apontar em vez de só avisar.
export class PerfilInvalido extends Error {
  readonly problemas: Problema[];

  constructor(problemas: Problema[]) {
    super(problemas.map((problema) => problema.mensagem).join(' '));
    this.name = 'PerfilInvalido';
    this.problemas = problemas;
  }
}
