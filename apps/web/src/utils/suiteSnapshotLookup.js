// Post-Etapa 11 (pedido directo del usuario): las cards de "Resultado por
// Expectativa" no mostraban con qué parámetro se configuró la regla (p.ej.
// "Tipo de dato válido" en la columna DNI no decía QUÉ tipo se esperaba,
// texto/número/fecha) — esa información no está en `result` (el schema de
// ValidationRun.results sólo guarda expected/actual para scope Tabla, ver
// ValidationRun.js#resultSchema), pero SÍ está en `run.suiteSnapshot` (la
// copia inmutable de `ExpectationSuite.expectations` al momento de correr,
// BR-DT-005) — ahí cada entrada trae su `params` completo.
//
// Empareja un `result` con su entrada de `suiteSnapshot` por expId + column
// (scope column) / columns en el mismo orden (scope multicolumn) / sólo
// expId (scope table, no hay column/columns que comparar).
export function findSuiteSnapshotEntry(suiteSnapshot = [], result) {
  return suiteSnapshot.find((entry) => {
    if (entry.expId !== result.expId) return false;
    if (result.column) return entry.column === result.column;
    if (result.columns) {
      return (
        Array.isArray(entry.columns) &&
        entry.columns.length === result.columns.length &&
        entry.columns.every((column, index) => column === result.columns[index])
      );
    }
    return entry.scope === 'table';
  });
}
