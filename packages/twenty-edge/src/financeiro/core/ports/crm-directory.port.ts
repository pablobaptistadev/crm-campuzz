import { type ContractHolder } from 'src/financeiro/core/domain/entities/gateway-contract.entity';

export type HolderContact = {
  email: string | null;
  /**
   * O e-mail financeiro do membro, quando ele tem um.
   *
   * Existe porque o principal muda — aluno troca de e-mail e o contrato no
   * gateway continua no antigo. Quem escolhe entre os dois e o caso de uso; o
   * diretorio so conta o que o registro tem.
   */
  financeEmail: string | null;
  displayName: string | null;
};

/**
 * O que o dominio precisa saber sobre um registro do CRM.
 *
 * So duas coisas: o e-mail (para a trava que impede vincular o contrato de outra
 * pessoa) e o clube de um membro (para a BU do clube valer para os membros dele).
 */
export type CrmDirectoryPort = {
  findHolderContact(holder: ContractHolder): Promise<HolderContact | null>;
  findCompanyIdForPerson(personId: string): Promise<string | null>;
};
