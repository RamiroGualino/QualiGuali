import { render, screen } from '@testing-library/react';
import { describe, test, expect, beforeAll } from 'vitest';
import i18n from '../src/i18n';
import { ExpectedVsActualComparison } from '../src/components/ExpectedVsActualComparison';

beforeAll(() => i18n.changeLanguage('en'));

describe('ExpectedVsActualComparison', () => {
  test('muestra esperado, obtenido y el badge de coincidencia', () => {
    render(<ExpectedVsActualComparison expected={15} actual={15} matches />);
    expect(screen.getAllByText('15')).toHaveLength(2);
    expect(screen.getByText(/Match/)).toBeInTheDocument();
  });

  test('cuando no coincide, muestra el badge de no-coincidencia', () => {
    render(<ExpectedVsActualComparison expected={15} actual={14} matches={false} />);
    expect(screen.getByText(/Does not match/)).toBeInTheDocument();
  });

  test('formatea listas (Validación de estructura) uniendo con coma', () => {
    render(
      <ExpectedVsActualComparison
        expected={['DNI', 'Nombre']}
        actual={['DNI', 'Nombre']}
        matches
      />,
    );
    expect(screen.getAllByText('DNI, Nombre')).toHaveLength(2);
  });
});
