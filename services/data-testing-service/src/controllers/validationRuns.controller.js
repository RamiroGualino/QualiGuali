const mongoose = require('mongoose');
const ExpectationSuite = require('../models/ExpectationSuite');
const ValidationRun = require('../models/ValidationRun');
const { parseSpreadsheetBuffer } = require('../utils/spreadsheetParser');
const { matchColumns } = require('../utils/columnMatching');
const { run: runEngine } = require('../engine/runEngine');

function suiteNotFound(res) {
  return res.status(404).json({ message: 'Expectation suite not found' });
}

function runNotFound(res) {
  return res.status(404).json({ message: 'Validation run not found' });
}

// BR-DT-002: las correcciones manuales del usuario (columnMappingOverrides)
// ganan sobre lo que matchColumns() sugirió automáticamente. Una entrada de
// override con matchedColumn vacío/null es "marcar que no está en este
// archivo" (matchType: 'not_found'), no un alias — nunca genera una
// corrección "guardable" (ver applyMappingCorrectionsToSuite abajo).
function applyOverrides(autoMatches, overrides) {
  const overrideByColumn = new Map(overrides.map((o) => [o.expectedColumn, o.matchedColumn || null]));

  return autoMatches.map((match) => {
    if (!overrideByColumn.has(match.expectedColumn)) return match;

    const matchedColumn = overrideByColumn.get(match.expectedColumn);
    return {
      expectedColumn: match.expectedColumn,
      matchedColumn,
      matchType: matchedColumn ? 'manual' : 'not_found',
    };
  });
}

// REQ-DT-010: "guardar esta corrección en la Suite" se traduce, en términos
// del schema real (no hay un campo de alias separado), a renombrar la
// entrada de expectedColumns por el nombre real que el usuario confirmó —
// así la próxima Corrida matchea 'exact' en vez de necesitar otra
// corrección manual. Cualquier expectation/businessIdColumn que apuntaba al
// nombre viejo se renombra junto, para no dejar la Suite inconsistente.
// Deliberadamente NO incrementa `version` (etapa-5 §9: no es un cambio de
// reglas, es un ajuste de nombres de columna).
function applyMappingCorrectionsToSuite(suite, finalMapping) {
  const renames = new Map();
  finalMapping.forEach((entry) => {
    if (entry.matchType === 'manual' && entry.matchedColumn) {
      renames.set(entry.expectedColumn, entry.matchedColumn);
    }
  });
  if (renames.size === 0) return false;

  // Etapa 6.2: expectedColumns pasó de [String] a [{name, tipoDato}] —
  // renombra por `.name`, conservando el `tipoDato` ya asignado.
  suite.expectedColumns = suite.expectedColumns.map((entry) =>
    renames.has(entry.name) ? { name: renames.get(entry.name), tipoDato: entry.tipoDato } : entry,
  );
  if (suite.businessIdColumn && renames.has(suite.businessIdColumn)) {
    suite.businessIdColumn = renames.get(suite.businessIdColumn);
  }
  suite.expectations.forEach((expectation) => {
    if (expectation.column && renames.has(expectation.column)) {
      expectation.column = renames.get(expectation.column);
    }
    if (expectation.columns) {
      expectation.columns = expectation.columns.map((column) => renames.get(column) || column);
    }
  });
  return true;
}

async function createValidationRun(req, res, next) {
  try {
    const { suiteId, columnMappingOverrides, saveMappingToSuite } = req.body;

    if (!suiteId) {
      return res.status(400).json({ message: 'suiteId is required' });
    }
    if (!mongoose.isValidObjectId(suiteId)) return suiteNotFound(res);

    // 1. Cargar la Suite — 404 antes de intentar parsear el archivo
    // (etapa-5's propia nota: "404 antes de intentar parsear el archivo").
    const suite = await ExpectationSuite.findById(suiteId);
    if (!suite) return suiteNotFound(res);

    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: 'A file is required (field name: "file")' });
    }

    let overrides = [];
    if (columnMappingOverrides) {
      try {
        overrides = JSON.parse(columnMappingOverrides);
      } catch (_err) {
        return res.status(400).json({ message: 'columnMappingOverrides must be valid JSON' });
      }
    }

    const startedAt = Date.now();

    // 2. Parsear el archivo (Etapa 2).
    const { headers, records } = parseSpreadsheetBuffer(file.buffer, file.originalname);

    // 3. matchColumns + correcciones manuales encima.
    const autoMatches = matchColumns(
      suite.expectedColumns.map((entry) => entry.name),
      headers,
    );
    const finalMapping = applyOverrides(autoMatches, overrides);

    // 5. Snapshot inmutable de las Expectativas (BR-DT-005) — se toma ANTES
    // de aplicar saveMappingToSuite más abajo, así esta misma Corrida queda
    // con el snapshot que realmente usó para evaluar, no el ya renombrado.
    const suiteSnapshot = suite.expectations.map((expectation) => expectation.toObject());
    const suiteSnapshotVersion = suite.version;

    // 4 + 6. columnCoverage y results (Etapa 3) — runEngine arma
    // columnCoverage a partir del mismo finalMapping, un solo lugar que
    // sabe hacerlo (no se duplica esa lógica acá).
    const { columnCoverage, results, overallStatus } = runEngine({
      records,
      headers,
      suiteSnapshot,
      columnMapping: finalMapping,
      sampleLimit: suite.sampleLimit,
      businessIdColumn: suite.businessIdColumn,
    });

    const durationMs = Date.now() - startedAt;

    // 8. Persistir.
    const validationRun = await ValidationRun.create({
      suiteId: suite._id,
      suiteSnapshotVersion,
      suiteSnapshot,
      projectId: suite.projectId,
      datasetName: file.originalname,
      executedBy: req.auth.userId,
      durationMs,
      overallStatus,
      columnCoverage,
      columnMapping: finalMapping,
      results,
    });

    // 9. saveMappingToSuite (REQ-DT-010) — después de persistir la Corrida,
    // para que lo que se guardó arriba refleje exactamente lo que se evaluó.
    const shouldSaveMapping = saveMappingToSuite === true || saveMappingToSuite === 'true';
    if (shouldSaveMapping && applyMappingCorrectionsToSuite(suite, finalMapping)) {
      await suite.save();
    }

    return res.status(201).json({ validationRun });
  } catch (err) {
    return next(err);
  }
}

async function listValidationRuns(req, res, next) {
  try {
    const { suiteId, projectId } = req.query;
    const filter = {};
    if (suiteId) filter.suiteId = suiteId;
    if (projectId) filter.projectId = projectId;

    const validationRuns = await ValidationRun.find(filter).sort({ executedAt: -1 });
    return res.status(200).json({ validationRuns });
  } catch (err) {
    return next(err);
  }
}

async function getValidationRun(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return runNotFound(res);

    const validationRun = await ValidationRun.findById(req.params.id);
    if (!validationRun) return runNotFound(res);

    return res.status(200).json({ validationRun });
  } catch (err) {
    return next(err);
  }
}

module.exports = { createValidationRun, listValidationRuns, getValidationRun };
