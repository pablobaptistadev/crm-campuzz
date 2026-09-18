import { type BusinessUnit } from 'src/core/domain/entities/business-unit.entity';
import {
  type ContractHolder,
  type GatewayContract,
} from 'src/core/domain/entities/gateway-contract.entity';
import {
  contractNotFound,
  emailMismatch,
  invalidCredentials,
  invalidInput,
} from 'src/core/domain/errors/financeiro.error';
import {
  contractIdentifierFrom,
  isValidContractIdentifier,
} from 'src/core/domain/value-objects/contract-identifier.value-object';
import {
  emailAddressEquals,
  emailAddressFrom,
} from 'src/core/domain/value-objects/email-address.value-object';
import { type BusinessUnitRepositoryPort } from 'src/core/ports/business-unit-repository.port';
import { type ContractRepositoryPort } from 'src/core/ports/contract-repository.port';
import { type CredentialVaultPort } from 'src/core/ports/credential-vault.port';
import { type CrmDirectoryPort } from 'src/core/ports/crm-directory.port';
import { type PaymentGatewayPort } from 'src/core/ports/payment-gateway.port';

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

  if (contact === null || contact.email === null) {
    throw invalidInput(
      'Este registro nao tem e-mail. Preencha o e-mail antes de vincular um contrato, porque e por ele que conferimos o titular no gateway.',
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

  if (
    customerEmail === null ||
    !emailAddressEquals(
      emailAddressFrom(customerEmail),
      emailAddressFrom(contact.email),
    )
  ) {
    throw emailMismatch();
  }

  const existing = await contracts.findByExternalIds({
    subscriptionId: contract.subscriptionId,
    transactionId: contract.transactionId,
  });

  return {
    businessUnit,
    contract,
    holderEmail: contact.email,
    alreadyLinkedContractId: existing?.id ?? null,
  };
};
