jest.mock('../../src/clients/projectsClient');

const path = require('path');
const request = require('supertest');
const createApp = require('../../src/app');
const testDb = require('../helpers/testDb');
const { tokenFor } = require('../helpers/token');
const projectsClient = require('../../src/clients/projectsClient');
const ExpectationSuite = require('../../src/models/ExpectationSuite');
const { ROLES } = require('@qualiguali/shared');

const app = createApp();
const qaToken = () => tokenFor({ role: ROLES.QA_ENGINEER });
const fixture = (name) => path.join(__dirname, '../__fixtures__/spreadsheets', name);

beforeAll(async () => testDb.connect());
afterEach(async () => {
  await testDb.clearDatabase();
  jest.resetAllMocks();
});
afterAll(async () => testDb.closeDatabase());

// valid.xlsx / valid.csv (fixtures de Etapa 2): headers reales
// nombre, edad, email — 3 filas, todas con edad entre 25 y 45.
async function createSuite(overrides = {}) {
  projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
  const res = await request(app)
    .post('/suites')
    .set('Authorization', `Bearer ${qaToken()}`)
    .send({
      projectId: 'proj-1',
      name: 'Suite de Afiliados',
      expectedColumns: [{ name: 'nombre' }, { name: 'edad', tipoDato: 'numero' }, { name: 'email' }],
      expectations: [
        { expId: 'EXP-DT-007', scope: 'column', column: 'nombre' },
        { expId: 'EXP-DT-012', scope: 'column', column: 'edad', params: { min: 0, max: 120 } },
      ],
      ...overrides,
    });
  return res.body.expectationSuite;
}

describe('POST /validation-runs', () => {
  test('corrida completa con archivo que matchea 100%: overallStatus según si las expectativas pasan', async () => {
    const suite = await createSuite();

    const res = await request(app)
      .post('/validation-runs')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('suiteId', suite._id)
      .attach('file', fixture('valid.xlsx'));

    expect(res.status).toBe(201);
    expect(res.body.validationRun.overallStatus).toBe('passed');
    expect(res.body.validationRun.results).toHaveLength(2);
    expect(res.body.validationRun.columnCoverage).toEqual([
      { expectedColumn: 'nombre', found: true },
      { expectedColumn: 'edad', found: true },
      { expectedColumn: 'email', found: true },
    ]);
    expect(res.body.validationRun.datasetName).toBe('valid.xlsx');
  });

  test('columna esperada ausente: found:false en columnCoverage, sin entrada en results (BR-DT-003)', async () => {
    const suite = await createSuite({
      expectedColumns: [{ name: 'nombre' }, { name: 'edad' }, { name: 'telefono' }],
      expectations: [
        { expId: 'EXP-DT-007', scope: 'column', column: 'nombre' },
        { expId: 'EXP-DT-007', scope: 'column', column: 'telefono' },
      ],
    });

    const res = await request(app)
      .post('/validation-runs')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('suiteId', suite._id)
      .attach('file', fixture('valid.xlsx'));

    expect(res.status).toBe(201);
    expect(res.body.validationRun.columnCoverage).toContainEqual({
      expectedColumn: 'telefono',
      found: false,
    });
    expect(res.body.validationRun.results).toHaveLength(1);
    expect(res.body.validationRun.results[0].column).toBe('nombre');
  });

  test('columnMappingOverrides: el mapeo manual prevalece sobre la sugerencia automática', async () => {
    // "correo" no matchea "email" ni por exacto ni por fuzzy (muy distinto) —
    // sin override quedaría not_found; con el override, se fuerza a "email".
    const suite = await createSuite({
      expectedColumns: [{ name: 'nombre' }, { name: 'correo' }],
      expectations: [{ expId: 'EXP-DT-007', scope: 'column', column: 'correo' }],
    });

    const res = await request(app)
      .post('/validation-runs')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('suiteId', suite._id)
      .field('columnMappingOverrides', JSON.stringify([{ expectedColumn: 'correo', matchedColumn: 'email' }]))
      .attach('file', fixture('valid.xlsx'));

    expect(res.status).toBe(201);
    const correoMapping = res.body.validationRun.columnMapping.find((m) => m.expectedColumn === 'correo');
    expect(correoMapping).toMatchObject({ matchedColumn: 'email', matchType: 'manual' });
    expect(res.body.validationRun.results).toHaveLength(1); // la expectativa sobre "correo" sí se evaluó
  });

  test('saveMappingToSuite: true actualiza la Suite (expectedColumns/expectations), sin cambiar version', async () => {
    const suite = await createSuite({
      expectedColumns: [{ name: 'nombre' }, { name: 'correo' }],
      expectations: [{ expId: 'EXP-DT-007', scope: 'column', column: 'correo' }],
    });

    await request(app)
      .post('/validation-runs')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('suiteId', suite._id)
      .field('columnMappingOverrides', JSON.stringify([{ expectedColumn: 'correo', matchedColumn: 'email' }]))
      .field('saveMappingToSuite', 'true')
      .attach('file', fixture('valid.xlsx'));

    const updated = await ExpectationSuite.findById(suite._id);
    const updatedNames = updated.expectedColumns.map((c) => c.name);
    expect(updatedNames).toContain('email');
    expect(updatedNames).not.toContain('correo');
    expect(updated.expectations[0].column).toBe('email');
    expect(updated.version).toBe(1); // no incrementa (etapa-5 §9)
  });

  test('saveMappingToSuite ausente: la Suite no cambia', async () => {
    const suite = await createSuite({
      expectedColumns: [{ name: 'nombre' }, { name: 'correo' }],
      expectations: [{ expId: 'EXP-DT-007', scope: 'column', column: 'correo' }],
    });

    await request(app)
      .post('/validation-runs')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('suiteId', suite._id)
      .field('columnMappingOverrides', JSON.stringify([{ expectedColumn: 'correo', matchedColumn: 'email' }]))
      .attach('file', fixture('valid.xlsx'));

    const unchanged = await ExpectationSuite.findById(suite._id);
    expect(unchanged.expectedColumns.map((c) => c.name)).toEqual(['nombre', 'correo']);
  });

  test('dos Corridas contra la misma Suite editada entre medio: cada una guarda su propio suiteSnapshotVersion, la primera no cambia retroactivamente (BR-DT-005)', async () => {
    const suite = await createSuite();

    const firstRun = await request(app)
      .post('/validation-runs')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('suiteId', suite._id)
      .attach('file', fixture('valid.xlsx'));
    expect(firstRun.body.validationRun.suiteSnapshotVersion).toBe(1);
    expect(firstRun.body.validationRun.results).toHaveLength(2);

    await request(app)
      .patch(`/suites/${suite._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({
        expectations: [{ expId: 'EXP-DT-007', scope: 'column', column: 'nombre' }],
      });

    const secondRun = await request(app)
      .post('/validation-runs')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('suiteId', suite._id)
      .attach('file', fixture('valid.xlsx'));
    expect(secondRun.body.validationRun.suiteSnapshotVersion).toBe(2);
    expect(secondRun.body.validationRun.results).toHaveLength(1);

    // La primera Corrida, releída, sigue con su snapshot original.
    const reread = await request(app)
      .get(`/validation-runs/${firstRun.body.validationRun._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(reread.body.validationRun.suiteSnapshotVersion).toBe(1);
    expect(reread.body.validationRun.results).toHaveLength(2);
  });

  test('suiteId inexistente — 404 antes de intentar parsear el archivo', async () => {
    const res = await request(app)
      .post('/validation-runs')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('suiteId', '64b6f7e2f1a2b3c4d5e6f7a8');
    // Ni siquiera se adjuntó un archivo — si esto no fuera 404, sería 400
    // ("A file is required"), lo que probaría que sí intentó seguir de largo.
    expect(res.status).toBe(404);
  });

  test('sin token — 401', async () => {
    const res = await request(app).post('/validation-runs').field('suiteId', 'x');
    expect(res.status).toBe(401);
  });
});

describe('GET /validation-runs', () => {
  // Corrección (Etapa 7, docs/data-testing/etapa-5-api-corridas.md): el
  // listado de Corridas de la Etapa 7 necesita filtrar por proyecto (no solo
  // por Suite) para poder listar "todas las Corridas del proyecto" — el
  // campo ya existía en el modelo (ValidationRun.projectId, indexado) pero
  // el controller sólo aceptaba ?suiteId.
  test('?projectId=X devuelve las Corridas de todas las Suites de ese proyecto', async () => {
    const suiteA = await createSuite({ projectId: 'proj-1' });
    const suiteB = await createSuite({ projectId: 'proj-1', name: 'Otra Suite' });
    await request(app)
      .post('/validation-runs')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('suiteId', suiteA._id)
      .attach('file', fixture('valid.xlsx'));
    await request(app)
      .post('/validation-runs')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('suiteId', suiteB._id)
      .attach('file', fixture('valid.csv'));

    const res = await request(app)
      .get('/validation-runs?projectId=proj-1')
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.validationRuns).toHaveLength(2);
  });

  test('?suiteId=X devuelve el historial ordenado por fecha descendente', async () => {
    const suite = await createSuite();
    await request(app)
      .post('/validation-runs')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('suiteId', suite._id)
      .attach('file', fixture('valid.xlsx'));
    await request(app)
      .post('/validation-runs')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('suiteId', suite._id)
      .attach('file', fixture('valid.csv'));

    const res = await request(app)
      .get(`/validation-runs?suiteId=${suite._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.validationRuns).toHaveLength(2);
    expect(new Date(res.body.validationRuns[0].executedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(res.body.validationRuns[1].executedAt).getTime(),
    );
  });
});

describe('GET /validation-runs/:id', () => {
  test('inexistente — 404', async () => {
    const res = await request(app)
      .get('/validation-runs/64b6f7e2f1a2b3c4d5e6f7a8')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(404);
  });
});
