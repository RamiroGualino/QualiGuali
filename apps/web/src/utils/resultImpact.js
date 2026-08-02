// Etapa 11 (docs/data-testing/etapa-11-rediseno-reporte-ejecucion.md), punto
// 11 ("Impacto: 2 de 60 registros (3.33%)"): deriva {affected, total} de un
// resultado sin cambiar qué evalúa el backend.
//
// Los evaluadores de scope column/multicolumn ya traen `totalUnexpected` y
// `evaluated` (Etapa 3, engine/helpers.js#tallyRecords) — se usan tal cual.
// Los de scope table (EXP-DT-001/002/003 - cantidad de filas/estructura/
// columnas) NO tienen esa noción: son un único booleano sobre todo el
// archivo, no un tally por fila. Para poder mostrar igualmente un impacto
// coherente, se asume que una regla de Tabla fallida afecta al archivo
// completo (no hay forma de saber qué subconjunto de filas "causó" que la
// cantidad de columnas esté mal) y una aprobada no afecta a ninguna —
// usando `totalRecords`, derivado de cualquier otro resultado de scope
// column/multicolumn en la misma Corrida (su `evaluated` es la cantidad
// real de filas del archivo). Si la Suite no tiene NINGUNA expectativa de
// columna/multicolumna, no hay forma de conocer el total — se devuelve
// `null` y el llamador simplemente no muestra el indicador.
export function deriveTotalRecords(results = []) {
  const withEvaluated = results.find(
    (result) => typeof result.evaluated === 'number' && result.evaluated > 0,
  );
  return withEvaluated ? withEvaluated.evaluated : null;
}

export function resultImpact(result, totalRecords) {
  if (typeof result.evaluated === 'number' && typeof result.totalUnexpected === 'number') {
    return { affected: result.totalUnexpected, total: result.evaluated };
  }
  if (totalRecords !== null && totalRecords !== undefined) {
    return { affected: result.status === 'passed' ? 0 : totalRecords, total: totalRecords };
  }
  return null;
}
