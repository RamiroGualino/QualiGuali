// Compartido entre dataQualityScore.js (promedio general) y RuleResultCard
// (barra de "% Éxito" por regla) — un resultado de scope column/multicolumn
// ya trae `successPercent`; uno de scope table (estructural, sin tally por
// fila) no, así que se deriva binario: 100 si pasó, 0 si no.
export function resultSuccessPercent(result) {
  if (result.successPercent !== null && result.successPercent !== undefined) {
    return result.successPercent;
  }
  return result.status === 'passed' ? 100 : 0;
}
