import { type ContractHolder } from 'src/core/domain/entities/gateway-contract.entity';
import { invalidInput } from 'src/core/domain/errors/financeiro.error';

export const holderFrom = (
  targetType: unknown,
  targetId: unknown,
): ContractHolder => {
  if (typeof targetId !== 'string' || targetId.trim().length === 0) {
    throw invalidInput('Nao identificamos o registro que abriu esta janela.');
  }

  if (targetType === 'COMPANY' || targetType === 'PERSON') {
    return { type: targetType, recordId: targetId };
  }

  throw invalidInput('Um contrato so pode ser vinculado a um clube ou a um membro.');
};
