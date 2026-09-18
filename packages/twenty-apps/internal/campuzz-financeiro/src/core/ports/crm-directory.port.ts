import { type ContractHolder } from 'src/core/domain/entities/gateway-contract.entity';

export type HolderContact = {
  email: string | null;
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
