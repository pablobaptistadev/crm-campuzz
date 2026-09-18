import { type ContractHolder } from 'src/core/domain/entities/gateway-contract.entity';
import {
  type CrmDirectoryPort,
  type HolderContact,
} from 'src/core/ports/crm-directory.port';
import {
  type Connection,
  firstNode,
  type ReadWriteClient,
} from 'src/infrastructure/persistence/record-shapes';

type PersonRecord = {
  emails: { primaryEmail: string | null } | null;
  name: { firstName: string | null; lastName: string | null } | null;
  companyId: string | null;
};

type CompanyRecord = {
  name: string | null;
  billingEmails: { primaryEmail: string | null } | null;
};

/**
 * O que o dominio precisa saber sobre um registro do CRM.
 *
 * Person ja tem `emails.primaryEmail`. Company nao tem e-mail nenhum no Twenty
 * padrao — por isso o app adiciona `billingEmails` a ela. Sem um e-mail do lado
 * do clube, a trava que confere o titular no gateway simplesmente nao teria o
 * que comparar, e vincular contrato de clube viraria um ato de fe.
 */
export class TwentyCrmDirectory implements CrmDirectoryPort {
  constructor(private readonly client: ReadWriteClient) {}

  async findHolderContact(
    holder: ContractHolder,
  ): Promise<HolderContact | null> {
    if (holder.type === 'PERSON') {
      const result: { people?: Connection<PersonRecord> } =
        await this.client.query({
          people: {
            __args: { filter: { id: { eq: holder.recordId } }, first: 1 },
            edges: {
              node: {
                emails: { primaryEmail: true },
                name: { firstName: true, lastName: true },
                companyId: true,
              },
            },
          },
        });

      const record = firstNode(result.people);

      if (record === null) {
        return null;
      }

      return {
        email: record.emails?.primaryEmail ?? null,
        displayName:
          [record.name?.firstName, record.name?.lastName]
            .filter((part) => part !== null && part !== undefined)
            .join(' ')
            .trim() || null,
      };
    }

    const result: { companies?: Connection<CompanyRecord> } =
      await this.client.query({
        companies: {
          __args: { filter: { id: { eq: holder.recordId } }, first: 1 },
          edges: {
            node: { name: true, billingEmails: { primaryEmail: true } },
          },
        },
      });

    const record = firstNode(result.companies);

    if (record === null) {
      return null;
    }

    return {
      email: record.billingEmails?.primaryEmail ?? null,
      displayName: record.name,
    };
  }

  async findCompanyIdForPerson(personId: string): Promise<string | null> {
    const result: { people?: Connection<{ companyId: string | null }> } =
      await this.client.query({
        people: {
          __args: { filter: { id: { eq: personId } }, first: 1 },
          edges: { node: { companyId: true } },
        },
      });

    return firstNode(result.people)?.companyId ?? null;
  }
}
