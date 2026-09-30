import {
  type ContratosDoRegistro,
  type Marcacao,
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
  marcacao,
}: {
  parcelas: Parcela[];
  contratos: ContratosDoRegistro;
  marcacao?: Marcacao;
}) => {
  const situacao = situacaoDeCobranca(cobrancasDe({ parcelas, contratos, marcacao }));

  if (!situacao.emAtraso) {
    return null;
  }

  const { manual, automatico, marcacao: marcado } = situacao.atrasadasPorOrigem;
  const cobrancas = manual + automatico;
  const partes = [
    `${manual} no financeiro manual`,
    `${automatico} no automático`,
    ...(marcado > 0 ? ['marcado como inadimplente pela equipe'] : []),
  ];

  return (
    <span className="adm-chip adm-chip--rose" title={partes.join(', ')}>
      {cobrancas > 0 ? `Em atraso · ${cobrancas}` : 'Inadimplente'}
    </span>
  );
};
