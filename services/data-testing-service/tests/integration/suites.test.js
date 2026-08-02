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

const validBody = {
  projectId: 'proj-1',
  name: 'Suite de Afiliados',
  expectedColumns: [{ name: 'nombre' }, { name: 'edad', tipoDato: 'numero' }, { name: 'email' }],
  expectations: [
    { expId: 'EXP-DT-007', scope: 'column', column: 'nombre' },
    { expId: 'EXP-DT-001', scope: 'table', params: { count: 3 } },
  ],
};

async function createSuite(overrides = {}) {
  projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
  return request(app)
    .post('/suites')
    .set('Authorization', `Bearer ${qaToken()}`)
    .send({ ...validBody, ...overrides });
}

describe('POST /suites', () => {
  test('crea una Suite con body válido — 201, Suite persistida', async () => {
    const res = await createSuite();

    expect(res.status).toBe(201);
    expect(res.body.expectationSuite.name).toBe('Suite de Afiliados');
    expect(res.body.expectationSuite.version).toBe(1);
    expect(res.body.expectationSuite.expectations).toHaveLength(2);
    expect(res.body.expectationSuite.createdBy).toEqual(expect.any(String));

    const persisted = await ExpectationSuite.findById(res.body.expectationSuite._id);
    expect(persisted).not.toBeNull();
  });

  test('guarda el tipoDato por columna (etapa 6.2), default sin_definir si no se especifica', async () => {
    const res = await createSuite({
      expectedColumns: [{ name: 'nombre' }, { name: 'edad', tipoDato: 'numero' }],
    });

    expect(res.status).toBe(201);
    const byName = Object.fromEntries(
      res.body.expectationSuite.expectedColumns.map((c) => [c.name, c.tipoDato]),
    );
    expect(byName.nombre).toBe('sin_definir');
    expect(byName.edad).toBe('numero');
  });

  test('sin projectId — 400', async () => {
    const res = await request(app)
      .post('/suites')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ ...validBody, projectId: undefined });
    expect(res.status).toBe(400);
    expect(projectsClient.getProject).not.toHaveBeenCalled();
  });

  test('sin name — 400', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const res = await request(app)
      .post('/suites')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ ...validBody, name: undefined });
    expect(res.status).toBe(400);
  });

  test('con un expId inválido dentro de expectations — 400', async () => {
    const res = await createSuite({
      expectations: [{ expId: 'EXP-DT-999', scope: 'column', column: 'nombre' }],
    });
    expect(res.status).toBe(400);
  });

  test('con scope "column" sin column — 400', async () => {
    const res = await createSuite({ expectations: [{ expId: 'EXP-DT-007', scope: 'column' }] });
    expect(res.status).toBe(400);
  });

  test('con column fuera de expectedColumns — 400', async () => {
    const res = await createSuite({
      expectations: [{ expId: 'EXP-DT-007', scope: 'column', column: 'no-existe' }],
    });
    expect(res.status).toBe(400);
  });

  test('con businessIdColumn fuera de expectedColumns — 400', async () => {
    const res = await createSuite({ businessIdColumn: 'dni' });
    expect(res.status).toBe(400);
  });

  test('cuando el proyecto no existe en projects-service — 400', async () => {
    projectsClient.getProject.mockResolvedValue(null);
    const res = await request(app)
      .post('/suites')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send(validBody);
    expect(res.status).toBe(400);
  });

  test('sin token — 401', async () => {
    const res = await request(app).post('/suites').send(validBody);
    expect(res.status).toBe(401);
  });
});

describe('GET /suites', () => {
  test('?projectId=X devuelve solo las Suites de ese proyecto', async () => {
    await createSuite({ projectId: 'proj-1', name: 'A' });
    await createSuite({ projectId: 'proj-2', name: 'B' });

    const res = await request(app)
      .get('/suites?projectId=proj-1')
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.expectationSuites).toHaveLength(1);
    expect(res.body.expectationSuites[0].name).toBe('A');
  });
});

describe('GET /suites/:id', () => {
  test('devuelve el detalle de una Suite', async () => {
    const created = await createSuite();
    const res = await request(app)
      .get(`/suites/${created.body.expectationSuite._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.expectationSuite._id).toBe(created.body.expectationSuite._id);
  });

  test('404 para una Suite inexistente', async () => {
    const res = await request(app)
      .get('/suites/64b6f7e2f1a2b3c4d5e6f7a8')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /suites/:id', () => {
  test('version pasa de 1 a 2', async () => {
    const created = await createSuite();
    const res = await request(app)
      .patch(`/suites/${created.body.expectationSuite._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ name: 'Suite renombrada' });

    expect(res.status).toBe(200);
    expect(res.body.expectationSuite.name).toBe('Suite renombrada');
    expect(res.body.expectationSuite.version).toBe(2);
  });

  test('con expectations inválidas — 400, no incrementa version', async () => {
    const created = await createSuite();
    const res = await request(app)
      .patch(`/suites/${created.body.expectationSuite._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ expectations: [{ expId: 'EXP-DT-999', scope: 'column', column: 'nombre' }] });

    expect(res.status).toBe(400);
    const persisted = await ExpectationSuite.findById(created.body.expectationSuite._id);
    expect(persisted.version).toBe(1);
  });

  test('404 para una Suite inexistente', async () => {
    const res = await request(app)
      .patch('/suites/64b6f7e2f1a2b3c4d5e6f7a8')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ name: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /suites/:id', () => {
  test('204, la Suite ya no aparece en el listado', async () => {
    const created = await createSuite();
    const res = await request(app)
      .delete(`/suites/${created.body.expectationSuite._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(204);

    const list = await request(app)
      .get('/suites?projectId=proj-1')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(list.body.expectationSuites).toHaveLength(0);
  });
});

describe('POST /suites/detect-columns', () => {
  test('con un .xlsx de fixture devuelve los headers esperados', async () => {
    const res = await request(app)
      .post('/suites/detect-columns')
      .set('Authorization', `Bearer ${qaToken()}`)
      .attach('file', fixture('valid.xlsx'));

    expect(res.status).toBe(200);
    expect(res.body.headers).toEqual(['nombre', 'edad', 'email']);
    // rowCount: cantidad de filas de datos (valid.xlsx tiene 3, sin contar
    // el header) — usado para precargar EXP-DT-001/003 en ExpectationSelector.
    expect(res.body.rowCount).toBe(3);
  });

  test('sin archivo — 400', async () => {
    const res = await request(app)
      .post('/suites/detect-columns')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(400);
  });
});

describe('POST /suites/:id/preview-match', () => {
  test('devuelve matchType correcto por columna', async () => {
    const created = await createSuite({
      expectedColumns: [{ name: 'nombre' }, { name: 'edad' }, { name: 'telefono' }],
    });

    const res = await request(app)
      .post(`/suites/${created.body.expectationSuite._id}/preview-match`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .attach('file', fixture('valid.xlsx')); // headers reales: nombre, edad, email

    expect(res.status).toBe(200);
    const byExpectedColumn = Object.fromEntries(
      res.body.matches.map((match) => [match.expectedColumn, match.matchType]),
    );
    expect(byExpectedColumn.nombre).toBe('exact');
    expect(byExpectedColumn.edad).toBe('exact');
    expect(byExpectedColumn.telefono).toBe('not_found');
    // headers (Etapa 7): las columnas reales del archivo, para poder ofrecer
    // "email" como opción de corrección manual sobre "telefono" (not_found).
    expect(res.body.headers).toEqual(['nombre', 'edad', 'email']);
  });

  test('404 para una Suite inexistente', async () => {
    const res = await request(app)
      .post('/suites/64b6f7e2f1a2b3c4d5e6f7a8/preview-match')
      .set('Authorization', `Bearer ${qaToken()}`)
      .attach('file', fixture('valid.xlsx'));
    expect(res.status).toBe(404);
  });
});
