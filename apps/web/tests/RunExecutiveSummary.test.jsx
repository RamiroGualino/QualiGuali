import { render, screen } from '@testing-library/react';
import { describe, test, expect, beforeAll } from 'vitest';
import i18n from '../src/i18n';
import { RunExecutiveSummary } from '../src/components/RunExecutiveSummary';

beforeAll(() => i18n.changeLanguage('en'));

// 5 aprobadas / 2 falladas de 7 — mismos números que el screenshot real que
// motivó este pedido (71.4% / 28.6%).
const RESULTS = [
  { expId: 'EXP-DT-001', status: 'passed', expected: 60, actual: 60 },
  { expId: 'EXP-DT-003', status: 'passed', expected: 15, actual: 15 },
  { expId: 'EXP-DT-007', column: 'nombre', status: 'passed' },
  { expId: 'EXP-DT-007', column: 'apellido', status: 'passed' },
  { expId: 'EXP-DT-012', column: 'edad', status: 'passed' },
  { expId: 'EXP-DT-007', column: 'dni', status: 'failed' },
  { expId: 'EXP-DT-010', column: 'dni', status: 'failed' },
];

describe('RunExecutiveSummary', () => {
  test('muestra el Data Quality Score y Aprobadas/Falladas como % (sin la card de Total reglas)', () => {
    render(<RunExecutiveSummary score={75} results={RESULTS} recordsProcessed={60} />);

    expect(screen.getByText('75%')).toBeInTheDocument(); // Data Quality Score
    expect(screen.getByText('71.4%')).toBeInTheDocument(); // Passed: 5/7
    expect(screen.getByText('5 of 7 rules')).toBeInTheDocument();
    expect(screen.getByText('28.6%')).toBeInTheDocument(); // Failed: 2/7
    expect(screen.getByText('2 of 7 rules')).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument();
    // La card "Total reglas" (con el conteo bruto como valor propio) ya no existe.
    expect(screen.queryByText('Total rules')).not.toBeInTheDocument();
  });

  test('lista qué reglas aprobaron y cuáles fallaron, con la columna cuando corresponde (pedido explícito del usuario)', () => {
    render(<RunExecutiveSummary score={75} results={RESULTS} recordsProcessed={60} />);

    // Tabla (sin columna): sólo el nombre.
    expect(screen.getByText('Record count')).toBeInTheDocument();
    // Columna: "columna: nombre" — el mismo nombre de regla puede repetirse
    // para columnas distintas, la columna lo desambigua.
    expect(screen.getByText('nombre: Must not contain empty values')).toBeInTheDocument();
    expect(screen.getByText('apellido: Must not contain empty values')).toBeInTheDocument();
    expect(screen.getByText('dni: Must not contain empty values')).toBeInTheDocument();
    expect(screen.getByText('dni: Valid data type')).toBeInTheDocument();
  });

  test('no muestra Duración (pedido explícito del usuario)', () => {
    render(<RunExecutiveSummary score={83} results={RESULTS} recordsProcessed={60} />);

    expect(screen.queryByText('Duration')).not.toBeInTheDocument();
  });

  test('no muestra un veredicto binario Aprobada/Fallida (pedido explícito del usuario)', () => {
    render(<RunExecutiveSummary score={83} results={RESULTS} recordsProcessed={60} />);

    expect(screen.queryByText(/does not meet the defined quality criteria/)).not.toBeInTheDocument();
    expect(screen.queryByText(/meets the defined quality criteria/)).not.toBeInTheDocument();
  });
});
