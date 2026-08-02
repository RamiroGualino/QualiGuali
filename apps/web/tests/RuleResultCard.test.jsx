import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, beforeAll } from 'vitest';
import i18n from '../src/i18n';
import { RuleResultCard } from '../src/components/RuleResultCard';

beforeAll(() => i18n.changeLanguage('en'));

const columnResult = {
  expId: 'EXP-DT-007',
  column: 'DNI',
  status: 'failed',
  threshold: 100,
  successPercent: 96.67,
  evaluated: 60,
  matched: 58,
  unexpectedSample: [null, null],
  sampleLimit: 20,
  totalUnexpected: 2,
  affectedRecords: [
    { rowId: 5, businessId: null },
    { rowId: 42, businessId: null },
  ],
};

const tableResult = {
  expId: 'EXP-DT-001',
  status: 'passed',
  expected: 60,
  actual: 60,
  unexpectedSample: [],
  affectedRecords: [],
};

const dataTypeResult = {
  expId: 'EXP-DT-010',
  column: 'DNI',
  status: 'failed',
  threshold: 100,
  successPercent: 3.33,
  evaluated: 60,
  matched: 2,
  unexpectedSample: [],
  totalUnexpected: 58,
  affectedRecords: [],
};

const suiteSnapshotWithType = [
  { expId: 'EXP-DT-010', scope: 'column', column: 'DNI', params: { type: 'text' }, threshold: 100 },
];

describe('RuleResultCard', () => {
  test('colapsado por defecto: nombre amigable, columna, estado, % y no muestra el detalle', () => {
    render(<RuleResultCard result={columnResult} totalRecords={60} />);

    expect(screen.getByText('Must not contain empty values')).toBeInTheDocument();
    expect(screen.getByText('DNI')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('96.67%')).toBeInTheDocument();
    expect(screen.queryByText('Rule explanation')).not.toBeInTheDocument();
  });

  test('expandir muestra la explicación y la tabla de fallas (Record/Value/Reason)', async () => {
    const user = userEvent.setup();
    render(<RuleResultCard result={columnResult} totalRecords={60} />);

    await user.click(screen.getByRole('button', { name: /Must not contain empty values/ }));

    expect(screen.getByText('Rule explanation')).toBeInTheDocument();
    expect(
      screen.getAllByText('Checks that every record has a value for this field.'),
    ).toHaveLength(2);
    expect(screen.getByText('Failure detail')).toBeInTheDocument();
    expect(screen.getByText('#5')).toBeInTheDocument();
  });

  test('scope Tabla: expandir muestra la comparación Esperado -> Obtenido, no la tabla de fallas', async () => {
    const user = userEvent.setup();
    render(<RuleResultCard result={tableResult} totalRecords={60} />);

    await user.click(screen.getByRole('button', { name: /Record count/ }));

    expect(screen.queryByText('Failure detail')).not.toBeInTheDocument();
    expect(screen.getByText(/Match/)).toBeInTheDocument();
  });

  test('impacto se deriva usando totalRecords para una regla de Tabla aprobada (0 afectados)', () => {
    render(<RuleResultCard result={tableResult} totalRecords={60} />);
    expect(screen.getByText('0 of 60 records')).toBeInTheDocument();
  });

  test('la barra de % de éxito es de dos colores: verde el % de éxito, rojo el resto', () => {
    const { container } = render(<RuleResultCard result={columnResult} totalRecords={60} />);
    const remainder = container.querySelector('[class*="remainder"]');
    expect(remainder).toBeInTheDocument();
    expect(remainder.className).toMatch(/fail/);
    expect(remainder.style.width).toBe('3.33%');
  });

  test('100% de éxito: no hay segmento rojo en la barra', () => {
    const fullyPassed = {
      ...columnResult,
      status: 'passed',
      successPercent: 100,
      totalUnexpected: 0,
      unexpectedSample: [],
      affectedRecords: [],
    };
    const { container } = render(<RuleResultCard result={fullyPassed} totalRecords={60} />);
    expect(container.querySelector('[class*="remainder"]')).not.toBeInTheDocument();
  });

  test('sin suiteSnapshot, no muestra ningún resumen de parámetros', () => {
    render(<RuleResultCard result={dataTypeResult} totalRecords={60} />);
    expect(screen.queryByText(/Data type:/)).not.toBeInTheDocument();
  });

  test('con suiteSnapshot, muestra el parámetro configurado de la regla (p.ej. el tipo de dato esperado)', () => {
    render(
      <RuleResultCard
        result={dataTypeResult}
        totalRecords={60}
        suiteSnapshot={suiteSnapshotWithType}
      />,
    );
    expect(screen.getByText('Data type: Text')).toBeInTheDocument();
  });

  test('una regla sin parámetros (p.ej. Not null) no muestra resumen aunque haya suiteSnapshot', () => {
    const notNullSnapshot = [
      { expId: 'EXP-DT-007', scope: 'column', column: 'DNI', params: {}, threshold: 100 },
    ];
    render(
      <RuleResultCard result={columnResult} totalRecords={60} suiteSnapshot={notNullSnapshot} />,
    );
    // "Must not contain empty values" no tiene parámetros configurables — no
    // hay nada de "resumen de parámetros" que agregar además del nombre.
    expect(screen.queryByText(/Data type:/)).not.toBeInTheDocument();
  });
});
