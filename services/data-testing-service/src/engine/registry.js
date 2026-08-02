// Etapa 3 (docs/data-testing/etapa-3-motor-de-evaluacion.md) — mapa
// { [expId]: evaluatorFn }, usado por runEngine.js para despachar. El
// `scope` de cada expId (table/column/multicolumn) determina qué firma
// tiene su evaluador — ver el comentario de cabecera de cada uno de los
// tres archivos hermanos.
const table = require('./tableExpectations');
const column = require('./columnExpectations');
const multicolumn = require('./multicolumnExpectations');

const registry = {
  // 6.1 Nivel Tabla
  'EXP-DT-001': table.rowCountEquals,
  'EXP-DT-002': table.rowCountBetween,
  'EXP-DT-003': table.columnCountEquals,
  'EXP-DT-004': table.columnCountBetween,
  'EXP-DT-005': table.columnsMatchOrderedList,
  'EXP-DT-006': table.columnsMatchSet,
  // 6.2 Nivel Columna
  'EXP-DT-007': column.notNull,
  'EXP-DT-008': column.isNull,
  'EXP-DT-009': column.isUnique,
  'EXP-DT-010': column.isOfType,
  'EXP-DT-011': column.isInTypeList,
  'EXP-DT-012': column.isBetween,
  'EXP-DT-013': column.isInSet,
  'EXP-DT-014': column.isNotInSet,
  'EXP-DT-015': column.lengthBetween,
  'EXP-DT-016': column.lengthEquals,
  'EXP-DT-017': column.matchesRegex,
  'EXP-DT-018': column.notMatchesRegex,
  'EXP-DT-019': column.matchesRegexList,
  'EXP-DT-020': column.notMatchesRegexList,
  'EXP-DT-021': column.isDateutilParseable,
  'EXP-DT-022': column.isJsonParseable,
  'EXP-DT-023': column.maxBetween,
  'EXP-DT-024': column.minBetween,
  'EXP-DT-025': column.meanBetween,
  'EXP-DT-026': column.medianBetween,
  'EXP-DT-027': column.stdevBetween,
  'EXP-DT-028': column.uniqueValueCountBetween,
  'EXP-DT-029': column.proportionOfUniqueBetween,
  'EXP-DT-030': column.mostCommonValueInSet,
  'EXP-DT-031': column.sumBetween,
  // 6.3 Nivel Multicolumna
  'EXP-DT-032': multicolumn.columnPairGreaterThan,
  'EXP-DT-033': multicolumn.columnPairEqual,
  'EXP-DT-034': multicolumn.combinationUniqueWithinRecord,
  'EXP-DT-035': multicolumn.multicolumnSumEquals,
};

module.exports = registry;
