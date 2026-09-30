// A marcação de inadimplência tem regra própria — desmarcar limpa valor e
// vencimento — e mora num card só dela, na aba Acompanhamento. No cadastro
// genérico os três campos seriam editáveis um a um, por fora dessa regra.
export const CAMPOS_DA_INADIMPLENCIA = [
  'inadimplenciaMarcada',
  'inadimplenciaValor',
  'inadimplenciaVencimento',
] as const;
