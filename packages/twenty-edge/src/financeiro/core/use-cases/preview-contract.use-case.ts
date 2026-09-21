import { type BusinessUnit } from 'src/financeiro/core/domain/entities/business-unit.entity';
import {
  type ContractHolder,
  type GatewayContract,
} from 'src/financeiro/core/domain/entities/gateway-contract.entity';
import {
  contractNotFound,
  invalidCredentials,
  invalidInput,
} from 'src/financeiro/core/domain/errors/financeiro.error';
import {
  contractIdentifierFrom,
  isValidContractIdentifier,
} from 'src/financeiro/core/domain/value-objects/contract-identifier.value-object';
import {
  emailAddressEquals,
  emailAddressFrom,
} from 'src/financeiro/core/domain/value-objects/email-address.value-object';
import { type BusinessUnitRepositoryPort } from 'src/financeiro/core/ports/business-unit-repository.port';
import { type ContractRepositoryPort } from 'src/financeiro/core/ports/contract-repository.port';
import { type CredentialVaultPort } from 'src/financeiro/core/ports/credential-vault.port';
import { type CrmDirectoryPort } from 'src/financeiro/core/ports/crm-directory.port';
import { type PaymentGatewayPort } from 'src/financeiro/core/ports/payment-gateway.port';

export type PreviewContractDependencies = {
  businessUnits: BusinessUnitRepositoryPort;
  contracts: ContractRepositoryPort;
  directory: CrmDirectoryPort;
  gateway: PaymentGatewayPort;
  vault: CredentialVaultPort;
};

export type PreviewContractInput = {
  holder: ContractHolder;
  businessUnitId: string;
  identifier: string;
};

export type PreviewContractOutput = {
  businessUnit: BusinessUnit;
  contract: GatewayContract;
  holderEmail: string;
  /** O e-mail do cliente no gateway é o mesmo do registro aberto? */
  emailConfere: boolean;
  /** Ja existe contrato com este id externo? Qual registro o tem. */
  alreadyLinkedContractId: string | null;
};

/**
 * Valida o contrato antes de gravar qualquer coisa.
 *
 * Duas travas, e as duas recusam em vez de avisar:
 *
 * 1. o e-mail do cliente no gateway tem de ser o do registro aberto. Sem ela, um
 *    numero digitado errado nao da erro — vincula o contrato de outra pessoa, e
 *    ninguem descobre ate a cobranca aparecer na ficha errada;
 * 2. o mesmo contrato nao pode estar em dois registros. O Campuzz tambem trava
 *    aqui, e por isso o preview devolve QUAL registro ja o tem: recusar sem dizer
 *    onde procurar faz a pessoa tentar de novo com o mesmo numero.
 *
 * Diferente do Campuzz, nao devolvemos `email_matches` como dado: divergencia ja
 * virou erro aqui, entao um campo que e sempre `true` so ocuparia a tela.
 */
export const previewContract = async (
  {
    businessUnits,
    contracts,
    directory,
    gateway,
    vault,
  }: PreviewContractDependencies,
  input: PreviewContractInput,
): Promise<PreviewContractOutput> => {
  if (!isValidContractIdentifier(input.identifier)) {
    throw invalidInput(
      'Informe o numero do contrato ou da transacao como aparece no painel.',
    );
  }

  const businessUnit = await businessUnits.findById(input.businessUnitId);

  if (businessUnit === null) {
    throw invalidInput('Escolha uma BU para consultar este contrato.');
  }

  const contact = await directory.findHolderContact(input.holder);

  // Clube paga pelo financeiro, e o mesmo financeiro assina todos os contratos
  // do clube: conferir contrato a contrato, como se faz com membro, daria
  // divergencia em todos. Membro e o contrario — cada um paga com o e-mail
  // dele, e a conferencia so faz sentido por contrato.
  const emailDeReferencia =
    input.holder.type === 'COMPANY'
      ? businessUnit.financeEmail
      : (contact?.email ?? null);

  if (emailDeReferencia === null || emailDeReferencia === '') {
    throw invalidInput(
      input.holder.type === 'COMPANY'
        ? 'Esta BU nao tem e-mail do financeiro. Cadastre-o junto com as chaves, porque e por ele que conferimos o titular do contrato do clube.'
        : 'Este membro nao tem e-mail. Preencha o e-mail antes de vincular um contrato, porque e por ele que conferimos o titular no gateway.',
    );
  }

  const credential = await vault.read(businessUnit.id);

  if (credential === null) {
    throw invalidCredentials();
  }

  const identifier = contractIdentifierFrom(input.identifier);
  const contract = await gateway.findContractByIdentifier(
    identifier,
    credential,
  );

  if (contract === null) {
    throw contractNotFound(identifier.value);
  }

  const customerEmail = contract.customer.email;

  // Divergência de e-mail deixou de recusar aqui: quem vincula precisa VER o
  // contrato para decidir, e há caso legítimo — a empresa que paga pelo membro,
  // o cônjuge, o sócio. Continua sendo recusa, mas na hora de gravar e só sem
  // confirmação explícita, com a diferença na tela.
  const emailConfere =
    customerEmail !== null &&
    emailAddressEquals(
      emailAddressFrom(customerEmail),
      emailAddressFrom(emailDeReferencia),
    );

  const existing = await contracts.findByExternalIds({
    subscriptionId: contract.subscriptionId,
    transactionId: contract.transactionId,
  });

  return {
    businessUnit,
    contract,
    holderEmail: emailDeReferencia,
    emailConfere,
    alreadyLinkedContractId: existing?.id ?? null,
  };
};
