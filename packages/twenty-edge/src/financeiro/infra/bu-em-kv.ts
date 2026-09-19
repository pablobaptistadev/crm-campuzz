import {
  type BusinessUnit,
  type GatewayCredential,
} from 'src/financeiro/core/domain/entities/business-unit.entity';
import { type BusinessUnitRepositoryPort } from 'src/financeiro/core/ports/business-unit-repository.port';
import { type CredentialVaultPort } from 'src/financeiro/core/ports/credential-vault.port';

// Guardar BU e chave no Postgres exige criar objeto e tabela no workspace, que é
// mudança de schema em produção. Enquanto essa mudança não é liberada, o KV que
// já existe como binding segura as duas coisas e a tela funciona.
//
// O preço é a consistência eventual do KV: salvar e ler no instante seguinte
// pode voltar vazio por até um minuto. Isso não morde no fluxo que existe hoje
// — salvar a BU devolve a BU salva, e puxar contrato é um clique humano depois —
// mas morde na idempotência do webhook, que é forte de verdade só com índice
// único. Por isso o webhook não entra antes da migração para o Postgres.
const CHAVE_DAS_BUS = (workspaceId: string) => `financeiro:bus:${workspaceId}`;
const CHAVE_DA_CREDENCIAL = (workspaceId: string, businessUnitId: string) =>
  `financeiro:credencial:${workspaceId}:${businessUnitId}`;

// Dono é o clube ou o membro que aponta para esta BU. Guardado aqui e não no
// registro porque acrescentar a relação ao objeto é a mudança de schema que
// ainda não temos.
const CHAVE_DO_DONO = (workspaceId: string, donoId: string) =>
  `financeiro:dono:${workspaceId}:${donoId}`;

type Guardadas = { bus: BusinessUnit[] };

const lerTodas = async (
  kv: KVNamespace,
  workspaceId: string,
): Promise<BusinessUnit[]> => {
  const cru = await kv.get(CHAVE_DAS_BUS(workspaceId));

  if (cru === null) {
    return [];
  }

  return (JSON.parse(cru) as Guardadas).bus;
};

const gravarTodas = (
  kv: KVNamespace,
  workspaceId: string,
  bus: BusinessUnit[],
): Promise<void> =>
  kv.put(CHAVE_DAS_BUS(workspaceId), JSON.stringify({ bus } satisfies Guardadas));

export const repositorioDeBuEmKv = ({
  kv,
  workspaceId,
}: {
  kv: KVNamespace;
  workspaceId: string;
}): BusinessUnitRepositoryPort => {
  const porDono = async (donoId: string): Promise<BusinessUnit | null> => {
    const businessUnitId = await kv.get(CHAVE_DO_DONO(workspaceId, donoId));

    if (businessUnitId === null) {
      return null;
    }

    const bus = await lerTodas(kv, workspaceId);

    return bus.find((bu) => bu.id === businessUnitId) ?? null;
  };

  return {
    findById: async (businessUnitId) =>
      (await lerTodas(kv, workspaceId)).find((bu) => bu.id === businessUnitId) ??
      null,

    findDefault: async () =>
      (await lerTodas(kv, workspaceId)).find((bu) => bu.isDefault) ?? null,

    findByCompanyId: porDono,
    findByPersonId: porDono,

    listAll: async () => {
      const bus = await lerTodas(kv, workspaceId);

      return [...bus].sort((a, b) =>
        a.isDefault === b.isDefault
          ? a.name.localeCompare(b.name, 'pt-BR')
          : Number(b.isDefault) - Number(a.isDefault),
      );
    },

    save: async (draft) => {
      const bus = await lerTodas(kv, workspaceId);
      const id = draft.id ?? crypto.randomUUID();

      const salva: BusinessUnit = {
        id,
        name: draft.name,
        gatewayProvider: draft.gatewayProvider,
        apiKeyPreview: draft.apiKeyPreview,
        keyFingerprint: draft.keyFingerprint,
        webhookRegistrationId: draft.webhookRegistrationId,
        gatewayWebhookId: draft.gatewayWebhookId,
        connectionStatus: draft.connectionStatus,
        lastValidatedAt: draft.lastValidatedAt,
        isDefault: draft.isDefault,
      };

      await gravarTodas(kv, workspaceId, [
        ...bus.filter((bu) => bu.id !== id),
        salva,
      ]);

      return salva;
    },

    clearDefaultExcept: async (businessUnitId) => {
      const bus = await lerTodas(kv, workspaceId);

      await gravarTodas(
        kv,
        workspaceId,
        bus.map((bu) =>
          bu.id === businessUnitId ? bu : { ...bu, isDefault: false },
        ),
      );
    },
  };
};

export const apontarDonoParaBu = ({
  kv,
  workspaceId,
  donoId,
  businessUnitId,
}: {
  kv: KVNamespace;
  workspaceId: string;
  donoId: string;
  businessUnitId: string | null;
}): Promise<void> =>
  businessUnitId === null
    ? kv.delete(CHAVE_DO_DONO(workspaceId, donoId))
    : kv.put(CHAVE_DO_DONO(workspaceId, donoId), businessUnitId);

export const cofreEmKv = ({
  kv,
  workspaceId,
}: {
  kv: KVNamespace;
  workspaceId: string;
}): CredentialVaultPort => ({
  read: async (businessUnitId) => {
    const cru = await kv.get(CHAVE_DA_CREDENCIAL(workspaceId, businessUnitId));

    return cru === null ? null : (JSON.parse(cru) as GatewayCredential);
  },

  write: (businessUnitId, credential) =>
    kv.put(
      CHAVE_DA_CREDENCIAL(workspaceId, businessUnitId),
      JSON.stringify(credential),
    ),

  erase: (businessUnitId) =>
    kv.delete(CHAVE_DA_CREDENCIAL(workspaceId, businessUnitId)),
});
