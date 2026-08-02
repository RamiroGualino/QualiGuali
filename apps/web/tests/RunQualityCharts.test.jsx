import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, beforeAll } from 'vitest';
import i18n from '../src/i18n';
import { RunQualityCharts } from '../src/components/RunQualityCharts';

beforeAll(() => i18n.changeLanguage('en'));

function buildResults() {
  const results = [{ status: 'passed', expected: 60, actual: 60 }]; // Table, ignorado en los 2 gráficos por columna
  const columns = ['Nombre', 'Apellido', 'Email', 'DNI', 'Telefono'];
  columns.forEach((column) => {
    results.push({
      column,
      status: column === 'DNI' ? 'failed' : 'passed',
      successPercent: column === 'DNI' ? 75 : 100,
    });
  });
  return results;
}

describe('RunQualityCharts', () => {
  test('muestra la leyenda del donut de reglas aprobadas vs falladas', () => {
    render(<RunQualityCharts results={buildResults()} />);
    expect(screen.getByText(/Passed: 5/)).toBeInTheDocument();
    expect(screen.getByText(/Failed: 1/)).toBeInTheDocument();
  });

  test('con 10 columnas o menos, no muestra el botón "ver todas"', () => {
    render(<RunQualityCharts results={buildResults()} />);
    expect(screen.queryByRole('button', { name: /View all columns/ })).not.toBeInTheDocument();
  });

  test('con más de 10 columnas, el botón "ver todas" alterna la vista completa', async () => {
    const user = userEvent.setup();
    const manyColumnsResults = Array.from({ length: 12 }, (_, i) => ({
      column: `Col${i}`,
      status: 'passed',
      successPercent: 100,
    }));
    render(<RunQualityCharts results={manyColumnsResults} />);

    const button = screen.getByRole('button', { name: 'View all columns (12)' });

    await user.click(button);

    expect(screen.getByRole('button', { name: 'View fewer' })).toBeInTheDocument();
  });

  test('distribución de errores por columna: DNI aparece en la leyenda con 1 regla', () => {
    render(<RunQualityCharts results={buildResults()} />);
    expect(screen.getByText(/DNI: 100% \(1 rules\)/)).toBeInTheDocument();
  });
});
