// Etapa 11 (docs/data-testing/etapa-11-rediseno-reporte-ejecucion.md): en el
// reporte de ejecución (audiencia amplia — QA Manual, Analistas Funcionales,
// Product Owners) se reemplaza el nombre técnico del catálogo
// (`dataTesting.expectations.<expId>`, el que sigue usando el selector de
// creación de Suites) por un nombre en lenguaje de negocio + una
// descripción corta de una línea. Mismo expId, mismo dato — sólo cambia el
// texto que se muestra.
export function friendlyExpectationName(expId, t) {
  return t(`dataTesting.friendlyName.${expId}`);
}

export function friendlyExpectationDescription(expId, t) {
  return t(`dataTesting.friendlyDescription.${expId}`);
}
