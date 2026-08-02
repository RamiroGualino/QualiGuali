import { render, screen } from '@testing-library/react';
import { describe, test, expect, beforeAll } from 'vitest';
import i18n from '../src/i18n';
import { FailureSampleTable } from '../src/components/FailureSampleTable';

beforeAll(() => i18n.changeLanguage('en'));

describe('FailureSampleTable', () => {
  test('sin muestra, muestra el estado vacío', () => {
    render(<FailureSampleTable samples={[]} affectedRecords={[]} reason="Must not be empty" />);
    expect(screen.getByText('No failures to show.')).toBeInTheDocument();
  });

  test('empareja cada valor de la muestra con su registro por índice, en orden', () => {
    render(
      <FailureSampleTable
        samples={[null, 'BAD']}
        affectedRecords={[
          { rowId: 5, businessId: null },
          { rowId: 42, businessId: '12345678' },
        ]}
        reason="Must not be empty"
      />,
    );

    const rows = screen.getAllByRole('row').slice(1); // sin el header
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('#5');
    expect(rows[0]).toHaveTextContent('NULL / empty');
    expect(rows[1]).toHaveTextContent('12345678');
    expect(rows[1]).toHaveTextContent('BAD');
    expect(screen.getAllByText('Must not be empty')).toHaveLength(2);
  });

  test('usa businessId cuando existe, o #rowId si no', () => {
    render(
      <FailureSampleTable
        samples={['x']}
        affectedRecords={[{ rowId: 7, businessId: null }]}
        reason="r"
      />,
    );
    expect(screen.getByText('#7')).toBeInTheDocument();
  });
});
