import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, test, expect, vi, beforeAll, beforeEach } from 'vitest';
import i18n from '../src/i18n';
import { ExpectationRunDetailPage } from '../src/pages/ExpectationRunDetailPage';
import { dataTestingApi } from '../src/api/dataTesting.api';
import { buildValidationRunPdf } from '../src/utils/dataTestReportPdf';

vi.mock('../src/api/dataTesting.api', () => ({
  dataTestingApi: { getRun: vi.fn(), getSuite: vi.fn() },
}));

// Etapa 8: el botón "Download report" sigue llamando a la exportación real
// — `dataTestReportPdf.js` ya tiene su propia batería de tests (fixtures
// grandes, sanitización); acá sólo interesa que el botón la invoca con los
// datos correctos y dispara `doc.save`. El rediseño de Etapa 11 no toca esta
// función ni el objeto `labels` que arma.
vi.mock('../src/utils/dataTestReportPdf', () => ({
  buildValidationRunPdf: vi.fn(() => ({ save: vi.fn() })),
}));

beforeAll(() => i18n.changeLanguage('en'));
beforeEach(() => {
  vi.clearAllMocks();
  dataTestingApi.getSuite.mockResolvedValue({ expectationSuite: { name: 'Suite de Afiliados' } });
});

const MOCK_RUN = {
  _id: 'run-1',
  suiteId: 'suite-1',
  datasetName: 'afiliados.xlsx',
  executedAt: '2026-07-01T10:00:00.000Z',
  executedBy: 'qa.manual@qualiguali.local',
  durationMs: 3500,
  overallStatus: 'failed',
  suiteSnapshot: [
    { expId: 'EXP-DT-007', scope: 'column', column: 'nombre', params: {}, threshold: 100 },
    {
      expId: 'EXP-DT-012',
      scope: 'column',
      column: 'edad',
      params: { min: 18, max: 65 },
      threshold: 100,
    },
  ],
  columnCoverage: [
    { expectedColumn: 'nombre', found: true },
    { expectedColumn: 'edad', found: true },
    { expectedColumn: 'telefono', found: false },
  ],
  results: [
    {
      expId: 'EXP-DT-007',
      column: 'nombre',
      status: 'passed',
      threshold: 100,
      successPercent: 100,
      evaluated: 10,
      matched: 10,
      unexpectedSample: [],
      sampleLimit: 20,
      totalUnexpected: 0,
      affectedRecords: [],
    },
    {
      expId: 'EXP-DT-012',
      column: 'edad',
      status: 'failed',
      threshold: 100,
      successPercent: 80,
      evaluated: 10,
      matched: 8,
      unexpectedSample: [150, -3],
      sampleLimit: 20,
      totalUnexpected: 2,
      affectedRecords: [{ rowId: 3, businessId: '30111222' }],
    },
  ],
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/projects/proj-1/data-testing/runs/run-1']}>
        <Routes>
          <Route
            path="/projects/:projectId/data-testing/runs/:runId"
            element={<ExpectationRunDetailPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ExpectationRunDetailPage', () => {
  test('renderiza Cobertura de Columnas y Resultado por Expectativa como bloques separados', async () => {
    dataTestingApi.getRun.mockResolvedValue({ validationRun: MOCK_RUN });
    renderPage();

    expect(await screen.findByText('Column Coverage')).toBeInTheDocument();
    expect(screen.getByText('Expectation Results')).toBeInTheDocument();
  });

  test('cada regla muestra con qué parámetro fue configurada, tomado de suiteSnapshot', async () => {
    dataTestingApi.getRun.mockResolvedValue({ validationRun: MOCK_RUN });
    renderPage();
    await screen.findByText('Column Coverage');

    expect(screen.getByText('Between 18 and 65')).toBeInTheDocument();
  });

  test('el resumen ejecutivo muestra el badge de estado (arriba) y el Data Quality Score', async () => {
    dataTestingApi.getRun.mockResolvedValue({ validationRun: MOCK_RUN });
    renderPage();
    await screen.findByText('Column Coverage');

    expect(screen.getAllByText('Failed').length).toBeGreaterThan(0);
    expect(screen.getByText('Data Quality Score')).toBeInTheDocument();
    // Sin la card de "Total reglas", sin veredicto binario grande, sin
    // Duración (pedidos explícitos del usuario).
    expect(screen.queryByText('Total rules')).not.toBeInTheDocument();
    expect(screen.queryByText('Duration')).not.toBeInTheDocument();
  });

  test('el botón "Download report" arma el ValidationRunPdf con la Suite resuelta y dispara doc.save', async () => {
    dataTestingApi.getRun.mockResolvedValue({ validationRun: MOCK_RUN });
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Column Coverage');
    await user.click(screen.getByRole('button', { name: 'Download report' }));

    expect(buildValidationRunPdf).toHaveBeenCalledWith(
      expect.objectContaining({ run: MOCK_RUN, suiteName: 'Suite de Afiliados' }),
    );
    const mockDoc = buildValidationRunPdf.mock.results[0].value;
    expect(mockDoc.save).toHaveBeenCalledWith('corrida-run-1.pdf');
  });

  test('una columna con found:false en cobertura no tiene card correspondiente en Resultado por Expectativa (BR-DT-003)', async () => {
    dataTestingApi.getRun.mockResolvedValue({ validationRun: MOCK_RUN });
    renderPage();
    await screen.findByText('Column Coverage');

    // "telefono" aparece en Cobertura de Columnas (found: false)...
    expect(screen.getByText('telefono')).toBeInTheDocument();
    // ...pero no hay ninguna RuleResultCard para esa columna: el mock de
    // `results` ya no la incluye (el motor de evaluación la excluyó por
    // BR-DT-003), acá sólo verificamos que el frontend no la reintroduce.
    expect(
      screen.queryByRole('button', { name: /telefono/ }),
    ).not.toBeInTheDocument();
  });

  test('expectativa failed: colapsada muestra el badge Failed; expandida muestra la muestra de fallos', async () => {
    dataTestingApi.getRun.mockResolvedValue({ validationRun: MOCK_RUN });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Column Coverage');

    const ruleButton = screen.getByRole('button', { name: /Value within range/ });
    expect(ruleButton).toHaveTextContent('edad');

    await user.click(ruleButton);

    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('-3')).toBeInTheDocument();
    expect(screen.getByText('30111222')).toBeInTheDocument();
  });

  test('expectativa passed con unexpectedSample vacío: expandir no rompe el layout ni muestra tabla de fallas', async () => {
    dataTestingApi.getRun.mockResolvedValue({ validationRun: MOCK_RUN });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Column Coverage');

    const ruleButton = screen.getByRole('button', { name: /Must not contain empty values/ });
    await user.click(ruleButton);

    expect(screen.getByText('Rule explanation')).toBeInTheDocument();
    expect(screen.queryByText('Failure detail')).not.toBeInTheDocument();
  });

  test('el filtro por columna muestra sólo las reglas de la columna elegida (pedido explícito del usuario)', async () => {
    dataTestingApi.getRun.mockResolvedValue({ validationRun: MOCK_RUN });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Column Coverage');

    // Sin filtrar: las dos reglas (nombre y edad) están presentes.
    expect(screen.getByRole('button', { name: /Must not contain empty values/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Value within range/ })).toBeInTheDocument();
    expect(screen.getByText('2 rules')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Filter by column'), 'edad');

    expect(
      screen.queryByRole('button', { name: /Must not contain empty values/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Value within range/ })).toBeInTheDocument();
    expect(screen.getByText('1 rules')).toBeInTheDocument();
  });
});
