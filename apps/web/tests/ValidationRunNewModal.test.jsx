import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, test, expect, vi, beforeAll, beforeEach } from 'vitest';
import i18n from '../src/i18n';
import { ValidationRunNewModal } from '../src/components/ValidationRunNewModal';
import { dataTestingApi } from '../src/api/dataTesting.api';

vi.mock('../src/api/dataTesting.api', () => ({
  dataTestingApi: { previewMatch: vi.fn(), createRun: vi.fn() },
}));

beforeAll(() => i18n.changeLanguage('en'));
beforeEach(() => vi.clearAllMocks());

const SUITES = [{ _id: 'suite-1', name: 'Suite de Afiliados' }];

const PREVIEW = {
  matches: [
    { expectedColumn: 'nombre', matchedColumn: 'nombre', matchType: 'exact' },
    { expectedColumn: 'edad', matchedColumn: 'edad_anios', matchType: 'fuzzy' },
    { expectedColumn: 'telefono', matchedColumn: null, matchType: 'not_found' },
  ],
  headers: ['nombre', 'edad_anios', 'email'],
};

function fileFor(name) {
  return new File(['nombre,edad_anios\nAna,30'], name, { type: 'text/csv' });
}

function renderModal(props = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ValidationRunNewModal suites={SUITES} onCreated={vi.fn()} onCancel={vi.fn()} {...props} />
    </QueryClientProvider>,
  );
}

async function selectSuiteAndUploadFile(user) {
  await user.type(screen.getByLabelText(/^Suite/), 'Suite de Afiliados');
  await user.upload(screen.getByTestId('dropzone-input'), fileFor('afiliados.csv'));
  await screen.findByRole('list', { name: 'Column mapping' });
}

function rowFor(expectedColumn) {
  return screen.getByRole('listitem', { name: expectedColumn });
}

describe('ValidationRunNewModal', () => {
  test('exact no pide acción, fuzzy pide confirmación, not_found muestra un selector vacío', async () => {
    dataTestingApi.previewMatch.mockResolvedValue(PREVIEW);
    const user = userEvent.setup();
    renderModal();

    await selectSuiteAndUploadFile(user);

    const exactRow = rowFor('nombre');
    expect(within(exactRow).getByText('Exact match')).toBeInTheDocument();
    expect(within(exactRow).queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    expect(within(exactRow).queryByRole('combobox')).not.toBeInTheDocument();

    const fuzzyRow = rowFor('edad');
    expect(within(fuzzyRow).getByText('Approximate match — confirm')).toBeInTheDocument();
    expect(within(fuzzyRow).getByRole('button', { name: 'Confirm' })).toBeInTheDocument();

    const notFoundRow = rowFor('telefono');
    expect(
      within(notFoundRow).getByText('Not found — assign a column or mark it as missing'),
    ).toBeInTheDocument();
    expect(within(notFoundRow).getByRole('combobox')).toBeInTheDocument();
  });

  test('Ejecutar deshabilitado mientras quede una columna not_found sin resolver, habilitado al corregirla', async () => {
    dataTestingApi.previewMatch.mockResolvedValue(PREVIEW);
    const user = userEvent.setup();
    renderModal();

    await selectSuiteAndUploadFile(user);

    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();

    const notFoundRow = rowFor('telefono');
    await user.selectOptions(within(notFoundRow).getByRole('combobox'), 'email');

    expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
  });

  test('corregir manualmente "telefono" a "email" y tildar guardar en la Suite llama a createRun con el payload correcto', async () => {
    dataTestingApi.previewMatch.mockResolvedValue(PREVIEW);
    dataTestingApi.createRun.mockResolvedValue({ validationRun: { _id: 'run-1' } });
    const user = userEvent.setup();
    const onCreated = vi.fn();
    renderModal({ onCreated });

    await selectSuiteAndUploadFile(user);

    const notFoundRow = rowFor('telefono');
    await user.selectOptions(within(notFoundRow).getByRole('combobox'), 'email');

    await user.click(screen.getByLabelText('Save these corrections to the Suite'));
    await user.click(screen.getByRole('button', { name: 'Run' }));

    expect(dataTestingApi.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        suiteId: 'suite-1',
        columnMappingOverrides: [{ expectedColumn: 'telefono', matchedColumn: 'email' }],
        saveMappingToSuite: true,
      }),
    );
  });
});
