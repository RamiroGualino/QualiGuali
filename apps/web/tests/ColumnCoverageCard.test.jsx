import { render, screen } from '@testing-library/react';
import { describe, test, expect, beforeAll } from 'vitest';
import i18n from '../src/i18n';
import { ColumnCoverageCard } from '../src/components/ColumnCoverageCard';

beforeAll(() => i18n.changeLanguage('en'));

describe('ColumnCoverageCard', () => {
  test('lista cada columna esperada y el conteo final encontrado/total', () => {
    render(
      <ColumnCoverageCard
        columnCoverage={[
          { expectedColumn: 'DNI', found: true },
          { expectedColumn: 'Nombre', found: true },
          { expectedColumn: 'Fantasma', found: false },
        ]}
      />,
    );

    expect(screen.getByText('DNI')).toBeInTheDocument();
    expect(screen.getByText('Fantasma')).toBeInTheDocument();
    expect(screen.getByText('2 / 3 columns found')).toBeInTheDocument();
  });
});
