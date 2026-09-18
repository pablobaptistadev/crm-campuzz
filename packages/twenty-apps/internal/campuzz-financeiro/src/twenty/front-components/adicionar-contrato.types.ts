export type BusinessUnitOption = {
  id: string;
  name: string;
  apiKeyPreview: string;
  connectionStatus: 'ACTIVE' | 'INVALID' | 'PENDING';
  isDefault: boolean;
};

export type ListBusinessUnitsResponse =
  | {
      success: true;
      resolvedBusinessUnitId: string | null;
      businessUnits: BusinessUnitOption[];
    }
  | { success: false; code: string; error: string };

export type SaveBusinessUnitResponse =
  | { success: true; businessUnit: BusinessUnitOption }
  | { success: false; code: string; error: string };

export type PreviewResponse =
  | {
      success: true;
      alreadyLinkedContractId: string | null;
      businessUnitName: string;
      customer: {
        name: string | null;
        email: string | null;
        document: string | null;
        phone: string | null;
      };
      contract: {
        kind: 'SUBSCRIPTION' | 'TRANSACTION';
        code: string | null;
        status: string;
        amount: number;
        totalValue: number;
        frequency: 'day' | 'week' | 'month' | 'year' | null;
        frequencyInterval: number | null;
        startsAt: string | null;
        endsAt: string | null;
        nextChargeAt: string | null;
        paymentMethod: string | null;
        invoiceCount: number;
        paidInvoiceCount: number;
      };
    }
  | { success: false; code: string; error: string };

export type AttachResponse =
  | { success: true; contractId: string; invoiceCount: number }
  | { success: false; code: string; error: string };

export type TargetType = 'COMPANY' | 'PERSON';
