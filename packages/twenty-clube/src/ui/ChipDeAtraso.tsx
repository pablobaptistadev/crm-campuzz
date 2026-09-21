import {
  type ContratosDoRegistro,
  cobrancasDe,
  situacaoDeCobranca,
} from 'src/ui/atraso';

type Parcela = {
  situacao: string | null;
  vencimento: string | null;
  pagaEm: string | null;
};

// Só aparece quando há atraso. Um selo permanente de "em dia" vira ruído, e o
// que precisa saltar aos olhos de quem abre a ficha é o contrário disso.
export const ChipDeAtraso = ({
  parcelas,
  contratos,
}: {
  parcelas: Parcela[];
  contratos: ContratosDoRegistro;
}) => {
  const situacao = situacaoDeCobranca(cobrancasDe({ parcelas, contratos }));

  if (!situacao.emAtraso) {
    return null;
  }

  const total =
    situacao.atrasadasPorOrigem.manual + situacao.atrasadasPorOrigem.automatico;

  return (
    <span
      className="adm-chip adm-chip--rose"
      title={`${situacao.atrasadasPorOrigem.manual} no financeiro manual, ${situacao.atrasadasPorOrigem.automatico} no automático`}
    >
      Em atraso · {total}
    </span>
  );
};
