import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, test, expect, vi, beforeAll, beforeEach } from 'vitest';
import i18n from '../src/i18n';
import { ExpectationSuiteFormPage } from '../src/pages/ExpectationSuiteFormPage';
import { dataTestingApi } from '../src/api/dataTesting.api';

vi.mock('../src/api/dataTesting.api', () => ({
  dataTestingApi: {
    getSuite: vi.fn(),
    createSuite: vi.fn(),
    updateSuite: vi.fn(),
    detectColumns: vi.fn(),
  },
}));

beforeAll(() => i18n.changeLanguage('en'));
beforeEach(() => vi.clearAllMocks());

function fileFor(name) {
  return new File(['nombre,edad\nAna,30'], name, { type: 'text/csv' });
}

function renderNew() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/projects/proj-1/data-testing/suites/new']}>
        <Routes>
          <Route
            path="/projects/:projectId/data-testing/suites/new"
            element={<ExpectationSuiteFormPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderEdit(suiteId = 'suite-1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/projects/proj-1/data-testing/suites/${suiteId}`]}>
        <Routes>
          <Route
            path="/projects/:projectId/data-testing/suites/:id"
            element={<ExpectationSuiteFormPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function uploadReference(user, { headers = ['nombre', 'edad', 'email'], rowCount = 3 } = {}) {
  dataTestingApi.detectColumns.mockResolvedValue({ headers, rowCount });
  await user.upload(screen.getByTestId('dropzone-input'), fileFor('ref.csv'));
  await screen.findByText(new RegExp(`${headers.length} columns detected`));
}

describe('ExpectationSuiteFormPage — create', () => {
  test('subir un archivo de referencia puebla las columnas detectadas como pastillas clickeables', async () => {
    const user = userEvent.setup();
    renderNew();

    await uploadReference(user);

    const pillList = screen.getByRole('list', { name: 'Detected columns' });
    expect(within(pillList).getByText('nombre')).toBeInTheDocument();
    expect(within(pillList).getByText('edad')).toBeInTheDocument();
    expect(within(pillList).getByText('email')).toBeInTheDocument();
    // También quedan disponibles como opciones de columna en ExpectationSelector.
    await user.click(screen.getByRole('tab', { name: 'Column' }));
    expect(screen.getByRole('option', { name: 'edad' })).toBeInTheDocument();
  });

  test('el dropzone colapsa a una barra de una línea después de subir el archivo', async () => {
    const user = userEvent.setup();
    renderNew();

    expect(screen.getByTestId('dropzone-input')).toBeInTheDocument();
    await uploadReference(user);

    expect(screen.queryByTestId('dropzone-input')).not.toBeInTheDocument();
    expect(screen.getByText(/ref\.csv · 3 columns detected/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change file' })).toBeInTheDocument();
  });

  test('"Change file" vuelve a mostrar el dropzone', async () => {
    const user = userEvent.setup();
    renderNew();
    await uploadReference(user);

    await user.click(screen.getByRole('button', { name: 'Change file' }));

    expect(screen.getByTestId('dropzone-input')).toBeInTheDocument();
  });

  test('click en una pastilla de columna detectada salta a la pestaña Columna con esa columna elegida', async () => {
    const user = userEvent.setup();
    renderNew();
    await uploadReference(user);

    const pillList = screen.getByRole('list', { name: 'Detected columns' });
    await user.click(within(pillList).getByText('edad'));

    expect(screen.getByRole('tab', { name: 'Column', selected: true })).toBeInTheDocument();
    expect(screen.getByLabelText('Column')).toHaveValue('edad');
    expect(screen.getByText('Configuring rules for: edad')).toBeInTheDocument();
  });

  test('"+ Add description" revela el textarea de descripción', async () => {
    const user = userEvent.setup();
    renderNew();

    expect(screen.queryByLabelText('Description')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '+ Add description' }));

    expect(screen.getByLabelText('Description')).toBeInTheDocument();
  });

  test('guardar con al menos 1 expectativa llama a createSuite con el payload correcto', async () => {
    const user = userEvent.setup();
    dataTestingApi.createSuite.mockResolvedValue({ expectationSuite: { _id: 'new-1' } });
    renderNew();

    await user.type(screen.getByLabelText(/^Name/), 'Suite de Afiliados');
    await uploadReference(user, { headers: ['nombre', 'edad'], rowCount: 2 });

    await user.click(screen.getByRole('tab', { name: 'Column' }));
    await user.selectOptions(screen.getByLabelText('Column'), 'nombre');
    await user.selectOptions(screen.getByLabelText('Expectation type'), 'EXP-DT-007');
    await user.click(screen.getByRole('button', { name: 'Add expectation' }));

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(dataTestingApi.createSuite).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-1',
        name: 'Suite de Afiliados',
        expectedColumns: [
          { name: 'nombre', tipoDato: 'sin_definir' },
          { name: 'edad', tipoDato: 'sin_definir' },
        ],
        expectations: [
          expect.objectContaining({ expId: 'EXP-DT-007', scope: 'column', column: 'nombre' }),
        ],
      }),
    );
  });

  test('etapa 6.2: definir el tipo de dato de una columna se guarda con la Suite', async () => {
    const user = userEvent.setup();
    dataTestingApi.createSuite.mockResolvedValue({ expectationSuite: { _id: 'new-1' } });
    renderNew();

    await user.type(screen.getByLabelText(/^Name/), 'Suite de Afiliados');
    await uploadReference(user, { headers: ['edad'], rowCount: 3 });

    const pillList = screen.getByRole('list', { name: 'Detected columns' });
    await user.click(within(pillList).getByText('edad'));
    await user.selectOptions(screen.getByLabelText("This column's data type"), 'numero');
    await user.selectOptions(screen.getByLabelText('Expectation type'), 'EXP-DT-012');
    await user.type(screen.getByLabelText('Minimum'), '0');
    await user.type(screen.getByLabelText('Maximum'), '120');
    await user.click(screen.getByRole('button', { name: 'Add expectation' }));

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(dataTestingApi.createSuite).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedColumns: [{ name: 'edad', tipoDato: 'numero' }],
      }),
    );
  });

  test('el botón Save está deshabilitado sin al menos 1 expectativa', async () => {
    const user = userEvent.setup();
    renderNew();
    await user.type(screen.getByLabelText(/^Name/), 'Suite de Afiliados');

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  test('editar una expectativa ya agregada la reemplaza en su lugar, no la duplica', async () => {
    const user = userEvent.setup();
    renderNew();
    await uploadReference(user, { headers: ['edad'], rowCount: 3 });

    await user.click(screen.getByRole('tab', { name: 'Column' }));
    await user.selectOptions(screen.getByLabelText('Column'), 'edad');
    await user.selectOptions(screen.getByLabelText('Expectation type'), 'EXP-DT-012');
    await user.type(screen.getByLabelText('Minimum'), '18');
    await user.type(screen.getByLabelText('Maximum'), '65');
    await user.click(screen.getByRole('button', { name: 'Add expectation' }));

    expect(screen.getByText('Between 18 and 65')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Maximum'));
    await user.type(screen.getByLabelText('Maximum'), '70');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(screen.getByText('Between 18 and 70')).toBeInTheDocument();
    expect(screen.queryByText('Between 18 and 65')).not.toBeInTheDocument();
    expect(screen.getByText('1 Column across 1 columns')).toBeInTheDocument();
  });
});

describe('ExpectationSuiteFormPage — edit', () => {
  test('hidrata el formulario con los datos de la Suite existente', async () => {
    dataTestingApi.getSuite.mockResolvedValue({
      expectationSuite: {
        _id: 'suite-1',
        name: 'Suite existente',
        description: 'desc',
        expectedColumns: [
          { name: 'dni', tipoDato: 'sin_definir' },
          { name: 'edad', tipoDato: 'numero' },
        ],
        businessIdColumn: 'dni',
        sampleLimit: 15,
        expectations: [{ expId: 'EXP-DT-007', scope: 'column', column: 'dni', threshold: 100 }],
      },
    });

    renderEdit();

    expect(await screen.findByDisplayValue('Suite existente')).toBeInTheDocument();
    expect(screen.getByDisplayValue('15')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    // Ya tiene columnas (de la Suite guardada) — arranca colapsado en la
    // barra, no mostrando el dropzone.
    expect(screen.queryByTestId('dropzone-input')).not.toBeInTheDocument();
    expect(screen.getByText(/2 columns already detected/)).toBeInTheDocument();
  });
});
