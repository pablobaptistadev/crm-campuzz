import { type BusinessUnit } from 'src/core/domain/entities/business-unit.entity';
import { type ContractHolder } from 'src/core/domain/entities/gateway-contract.entity';
import { businessUnitNotFound } from 'src/core/domain/errors/financeiro.error';
import { type BusinessUnitRepositoryPort } from 'src/core/ports/business-unit-repository.port';
import { type CrmDirectoryPort } from 'src/core/ports/crm-directory.port';

export type ResolveBusinessUnitDependencies = {
  businessUnits: BusinessUnitRepositoryPort;
  directory: CrmDirectoryPort;
};

/**
 * Qual BU vale para este registro.
 *
 * A cascata e o que resolve "global ou diferente por clube ou membro" sem pedir
 * configuracao de ninguem: quem nao configurou nada cai na BU padrao; um clube
 * com contrato em outro workspace aponta a BU dele e os membros herdam; um
 * membro que destoa aponta a propria.
 *
 * O resultado e um padrao, nao uma trava — o popup mostra a BU resolvida e deixa
 * trocar, porque quem esta vinculando sabe coisas que a cascata nao sabe.
 */
export const resolveBusinessUnit = async (
  { businessUnits, directory }: ResolveBusinessUnitDependencies,
  holder: ContractHolder,
): Promise<BusinessUnit> => {
  const own =
    holder.type === 'COMPANY'
      ? await businessUnits.findByCompanyId(holder.recordId)
      : await businessUnits.findByPersonId(holder.recordId);

  if (own !== null) {
    return own;
  }

  if (holder.type === 'PERSON') {
    const companyId = await directory.findCompanyIdForPerson(holder.recordId);

    if (companyId !== null) {
      const fromCompany = await businessUnits.findByCompanyId(companyId);

      if (fromCompany !== null) {
        return fromCompany;
      }
    }
  }

  const fallback = await businessUnits.findDefault();

  if (fallback === null) {
    throw businessUnitNotFound();
  }

  return fallback;
};
