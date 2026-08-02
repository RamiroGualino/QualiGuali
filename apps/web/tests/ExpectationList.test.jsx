import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeAll } from 'vitest';
import i18n from '../src/i18n';
import { ExpectationList } from '../src/components/ExpectationList';

beforeAll(() => i18n.changeLanguage('en'));

const EXPECTATIONS = [
  { expId: 'EXP-DT-001', scope: 'table', params: { count: 4 } },
  { expId: 'EXP-DT-007', scope: 'column', column: 'dni', params: {}, threshold: 100 },
  { expId: 'EXP-DT-012', scope: 'column', column: 'edad', params: { min: 18, max: 65 }, threshold: 90 },
  {
    expId: 'EXP-DT-034',
    scope: 'multicolumn',
    columns: ['nombre', 'email'],
    params: {},
    threshold: 100,
  },
];

describe('ExpectationList', () => {
  test('sin expectativas muestra el mensaje vacío', () => {
    render(<ExpectationList expectations={[]} />);
    expect(screen.getByText("You haven't added any expectations yet.")).toBeInTheDocument();
  });

  test('el resumen siempre cuenta todo, sin importar el scope activo', () => {
    render(<ExpectationList expectations={EXPECTATIONS} scope="multicolumn" />);

    expect(screen.getByText('1 Table')).toBeInTheDocument();
    expect(screen.getByText('2 Column across 2 columns')).toBeInTheDocument();
    expect(screen.getByText('1 Multicolumn')).toBeInTheDocument();
  });

  describe('scope="table"', () => {
    test('sólo lista la expectativa de Tabla, como lista plana (sin agrupar)', () => {
      render(<ExpectationList expectations={EXPECTATIONS} scope="table" />);

      expect(screen.getByText('Row count = 4')).toBeInTheDocument();
      expect(screen.queryByText(/Between 18 and 65/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Unique combination/)).not.toBeInTheDocument();
      // Lista plana: no hay <details>/<summary> agrupador de por medio.
      expect(screen.queryByRole('group')).not.toBeInTheDocument();
    });
  });

  describe('scope="column"', () => {
    test('sólo lista expectativas de columna, agrupadas por columna', () => {
      render(<ExpectationList expectations={EXPECTATIONS} scope="column" />);

      expect(screen.queryByText('Row count = 4')).not.toBeInTheDocument();
      expect(screen.queryByText(/Unique combination/)).not.toBeInTheDocument();
      expect(screen.getByText('dni (1)')).toBeInTheDocument();
      expect(screen.getByText('edad (1)')).toBeInTheDocument();
      expect(screen.getByText('Between 18 and 65')).toBeInTheDocument();
    });

    test('threshold != 100 muestra el chip de Umbral; threshold == 100 no muestra nada', () => {
      render(<ExpectationList expectations={EXPECTATIONS} scope="column" />);

      const edadGroup = screen.getByText('edad (1)').closest('details');
      expect(within(edadGroup).getByText('Threshold: 90%')).toBeInTheDocument();

      const dniGroup = screen.getByText('dni (1)').closest('details');
      expect(within(dniGroup).queryByText(/Threshold:/)).not.toBeInTheDocument();
    });

    test('Edit llama a onEdit con el índice real dentro del array plano', async () => {
      const user = userEvent.setup();
      const onEdit = vi.fn();
      render(<ExpectationList expectations={EXPECTATIONS} scope="column" onEdit={onEdit} />);

      const edadGroup = screen.getByText('edad (1)').closest('details');
      await user.click(within(edadGroup).getByRole('button', { name: 'Edit' }));

      expect(onEdit).toHaveBeenCalledWith(2);
    });
  });

  describe('scope="multicolumn"', () => {
    test('sólo lista la expectativa de Multicolumna, como lista plana', () => {
      render(<ExpectationList expectations={EXPECTATIONS} scope="multicolumn" />);

      expect(screen.getByText('Unique combination: nombre, email')).toBeInTheDocument();
      expect(screen.queryByText('Row count = 4')).not.toBeInTheDocument();
      expect(screen.queryByText(/Between 18 and 65/)).not.toBeInTheDocument();
    });

    test('Remove llama a onRemove con el índice real dentro del array plano', async () => {
      const user = userEvent.setup();
      const onRemove = vi.fn();
      render(<ExpectationList expectations={EXPECTATIONS} scope="multicolumn" onRemove={onRemove} />);

      await user.click(screen.getByRole('button', { name: 'Remove' }));

      expect(onRemove).toHaveBeenCalledWith(3);
    });
  });

  test('scope sin expectativas propias muestra el mensaje "sin expectativas en esta pestaña"', () => {
    render(<ExpectationList expectations={[EXPECTATIONS[0]]} scope="multicolumn" />);

    expect(screen.getByText('No expectations in this tab yet.')).toBeInTheDocument();
  });
});
