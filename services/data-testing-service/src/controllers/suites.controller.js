const mongoose = require('mongoose');
const ExpectationSuite = require('../models/ExpectationSuite');
const projectsClient = require('../clients/projectsClient');
const registry = require('../engine/registry');
const { parseSpreadsheetBuffer } = require('../utils/spreadsheetParser');
const { matchColumns } = require('../utils/columnMatching');

const VALID_EXP_IDS = new Set(Object.keys(registry));
const VALID_SCOPES = new Set(['table', 'column', 'multicolumn']);

function notFound(res) {
  return res.status(404).json({ message: 'Expectation suite not found' });
}

// Etapa 6.2: `expectedColumns` pasa de `[String]` a `[{name, tipoDato}]` —
// todo lo que antes comparaba nombres de columna directamente contra ese
// array ahora compara contra sus `.name`.
function expectedColumnNames(expectedColumns) {
  return expectedColumns.map((entry) => entry.name);
}

// Validación de negocio (Etapa 4): el schema (Etapa 1) ya rechaza un expId
// fuera del catálogo o un scope fuera del enum, pero no sabe nada sobre
// "column requerido si scope==='column'" ni sobre expectedColumns — eso es
// contexto de la Suite completa, no de una expectativa aislada. Devuelve un
// mensaje de error (string) o null si todo está bien.
function validateExpectations(expectations, expectedColumns) {
  const names = expectedColumnNames(expectedColumns);
  for (const expectation of expectations) {
    if (!VALID_EXP_IDS.has(expectation.expId)) {
      return `expId "${expectation.expId}" is not a valid catalog id`;
    }
    if (!VALID_SCOPES.has(expectation.scope)) {
      return `scope "${expectation.scope}" is not valid`;
    }
    if (expectation.scope === 'column') {
      if (!expectation.column) {
        return `expectation "${expectation.expId}" requires a column (scope: 'column')`;
      }
      if (!names.includes(expectation.column)) {
        return `expectation column "${expectation.column}" is not in expectedColumns`;
      }
    }
    if (expectation.scope === 'multicolumn') {
      if (!Array.isArray(expectation.columns) || expectation.columns.length < 2) {
        return `expectation "${expectation.expId}" requires at least 2 columns (scope: 'multicolumn')`;
      }
      const missingColumn = expectation.columns.find((column) => !names.includes(column));
      if (missingColumn) {
        return `expectation column "${missingColumn}" is not in expectedColumns`;
      }
    }
  }
  return null;
}

async function createExpectationSuite(req, res, next) {
  try {
    const { projectId, name, description, sampleLimit, businessIdColumn, expectedColumns, expectations } =
      req.body;

    if (!projectId) {
      return res.status(400).json({ message: 'projectId is required' });
    }
    if (!name) {
      return res.status(400).json({ message: 'name is required' });
    }

    const project = await projectsClient.getProject(projectId, req.headers.authorization);
    if (!project) {
      return res.status(400).json({ message: `Project "${projectId}" not found` });
    }

    const finalExpectedColumns = expectedColumns || [];
    const finalExpectations = expectations || [];

    const expectationsError = validateExpectations(finalExpectations, finalExpectedColumns);
    if (expectationsError) {
      return res.status(400).json({ message: expectationsError });
    }
    if (businessIdColumn && !expectedColumnNames(finalExpectedColumns).includes(businessIdColumn)) {
      return res
        .status(400)
        .json({ message: `businessIdColumn "${businessIdColumn}" is not in expectedColumns` });
    }

    const expectationSuite = await ExpectationSuite.create({
      projectId,
      name,
      description: description || '',
      sampleLimit: sampleLimit !== undefined ? Number(sampleLimit) : undefined,
      businessIdColumn: businessIdColumn || null,
      expectedColumns: finalExpectedColumns,
      expectations: finalExpectations,
      createdBy: req.auth.userId,
    });

    return res.status(201).json({ expectationSuite });
  } catch (err) {
    if (err instanceof mongoose.Error.ValidationError) {
      return res.status(400).json({ message: err.message });
    }
    return next(err);
  }
}

async function listExpectationSuites(req, res, next) {
  try {
    const { projectId } = req.query;
    const filter = {};
    if (projectId) filter.projectId = projectId;

    const expectationSuites = await ExpectationSuite.find(filter).sort({ createdAt: -1 });
    return res.status(200).json({ expectationSuites });
  } catch (err) {
    return next(err);
  }
}

async function getExpectationSuite(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const expectationSuite = await ExpectationSuite.findById(req.params.id);
    if (!expectationSuite) return notFound(res);

    return res.status(200).json({ expectationSuite });
  } catch (err) {
    return next(err);
  }
}

// BR-DT-005: toda edición incrementa `version` en 1 — cada ValidationRun
// (Etapa 5) guarda con qué versión corrió, así una edición posterior nunca
// altera corridas pasadas. Acepta actualización parcial (mismo criterio que
// PATCH /postman-suites/:id en execution-service) — sólo valida
// expectations/businessIdColumn si el request efectivamente los toca,
// contra el expectedColumns final (el nuevo si vino, si no el que ya tenía
// la Suite).
async function updateExpectationSuite(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const expectationSuite = await ExpectationSuite.findById(req.params.id);
    if (!expectationSuite) return notFound(res);

    const { name, description, sampleLimit, businessIdColumn, expectedColumns, expectations } = req.body;

    const finalExpectedColumns =
      expectedColumns !== undefined ? expectedColumns : expectationSuite.expectedColumns;
    const finalBusinessIdColumn =
      businessIdColumn !== undefined ? businessIdColumn : expectationSuite.businessIdColumn;

    if (expectations !== undefined) {
      const expectationsError = validateExpectations(expectations, finalExpectedColumns);
      if (expectationsError) {
        return res.status(400).json({ message: expectationsError });
      }
    }
    if (finalBusinessIdColumn && !expectedColumnNames(finalExpectedColumns).includes(finalBusinessIdColumn)) {
      return res
        .status(400)
        .json({ message: `businessIdColumn "${finalBusinessIdColumn}" is not in expectedColumns` });
    }

    if (name !== undefined) expectationSuite.name = name;
    if (description !== undefined) expectationSuite.description = description;
    if (sampleLimit !== undefined) expectationSuite.sampleLimit = Number(sampleLimit);
    if (businessIdColumn !== undefined) expectationSuite.businessIdColumn = businessIdColumn || null;
    if (expectedColumns !== undefined) expectationSuite.expectedColumns = expectedColumns;
    if (expectations !== undefined) expectationSuite.expectations = expectations;
    expectationSuite.version += 1;

    await expectationSuite.save();

    return res.status(200).json({ expectationSuite });
  } catch (err) {
    if (err instanceof mongoose.Error.ValidationError) {
      return res.status(400).json({ message: err.message });
    }
    return next(err);
  }
}

// Sin cascada a ValidationRun (a diferencia del hard-delete con cascada de
// PostmanSuite en execution-service) — el historial de Corridas persiste con
// su propio suiteSnapshot inmutable, no depende de que la Suite siga
// existiendo (etapa-4's propia nota).
async function deleteExpectationSuite(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const expectationSuite = await ExpectationSuite.findByIdAndDelete(req.params.id);
    if (!expectationSuite) return notFound(res);

    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

// No persiste nada — sólo parsea el archivo de referencia (Etapa 2) para
// poblar el selector de columnas del formulario de creación (REQ-DT-002).
// `rowCount` (cantidad de filas de datos, sin contar el header) agregado
// para precargar el valor real en ExpectationSelector cuando se elige una
// expectativa de nivel Tabla sobre cantidad de filas/columnas — antes sólo
// se devolvían los headers.
async function detectColumns(req, res, next) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: 'A file is required (field name: "file")' });
    }

    const { headers, records } = parseSpreadsheetBuffer(file.buffer, file.originalname);
    return res.status(200).json({ headers, rowCount: records.length });
  } catch (err) {
    return next(err);
  }
}

// Usado por el modal de "nueva Corrida" (Etapa 7) para mostrar la sugerencia
// de mapeo antes de confirmar — no persiste nada tampoco, sólo corre
// matchColumns (Etapa 2) contra expectedColumns de esta Suite.
async function previewMatch(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const expectationSuite = await ExpectationSuite.findById(req.params.id);
    if (!expectationSuite) return notFound(res);

    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: 'A file is required (field name: "file")' });
    }

    const { headers } = parseSpreadsheetBuffer(file.buffer, file.originalname);
    const matches = matchColumns(expectedColumnNames(expectationSuite.expectedColumns), headers);

    // `headers` agregado en Etapa 7 (docs/data-testing/etapa-4-api-suites.md,
    // "Corrección"): el wizard de nueva Corrida necesita poder ofrecer una
    // columna real del archivo para una corrección manual sobre una entrada
    // 'not_found' — matches sólo trae, por columna esperada, la que matcheó
    // (o null); las columnas del archivo no matcheadas por nadie no
    // aparecían en ningún lado.
    return res.status(200).json({ matches, headers });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createExpectationSuite,
  listExpectationSuites,
  getExpectationSuite,
  updateExpectationSuite,
  deleteExpectationSuite,
  detectColumns,
  previewMatch,
};
