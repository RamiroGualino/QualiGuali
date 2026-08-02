import { render, screen } from '@testing-library/react';
import { describe, test, expect, beforeAll } from 'vitest';
import i18n from '../src/i18n';
import { RunFinalVerdict } from '../src/components/RunFinalVerdict';

beforeAll(() => i18n.changeLanguage('en'));

const columnCoverage = [
  { expectedColumn: 'DNI', found: true },
  { expectedColumn: 'Nombre', found: true },
];

describe('RunFinalVerdict', () => {
  test('corrida fallida con una columna faltante y una regla de columna fallada: 3 de 4 items en X', () => {
    render(
      <RunFinalVerdict
        columnCoverage={[...columnCoverage, { expectedColumn: 'Fantasma', found: false }]}
        results={[
          { status: 'passed', expected: 60, actual: 60 },
          { column: 'DNI', status: 'failed', successPercent: 96.67 },
        ]}
        overallStatus="failed"
      />,
    );

    expect(screen.getByText('All expected columns were found')).toBeInTheDocument();
    expect(screen.getByText('Table structure rules passed')).toBeInTheDocument();
    expect(screen.getByText('Column and Multicolumn rules passed')).toBeInTheDocument();
    expect(
      screen.getByText('The run does not meet the defined quality criteria.'),
    ).toBeInTheDocument();
  });

  test('corrida totalmente aprobada: veredicto final en verde', () => {
    render(
      <RunFinalVerdict
        columnCoverage={columnCoverage}
        results={[
          { status: 'passed', expected: 60, actual: 60 },
          { column: 'DNI', status: 'passed', successPercent: 100 },
        ]}
        overallStatus="passed"
      />,
    );

    expect(
      screen.getByText('The run meets the defined quality criteria.'),
    ).toBeInTheDocument();
  });
});
