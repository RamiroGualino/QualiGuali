const { normalizeColumnName, matchColumns } = require('../../src/utils/columnMatching');

describe('normalizeColumnName', () => {
  test('"Fecha de Nacimiento" y "fecha   de nacimiento" normalizan igual', () => {
    expect(normalizeColumnName('Fecha de Nacimiento')).toBe(
      normalizeColumnName('fecha   de nacimiento'),
    );
  });

  test('"Núm. Afiliado" y "Num Afiliado" normalizan igual (sin tildes, sin puntuación)', () => {
    expect(normalizeColumnName('Núm. Afiliado')).toBe(normalizeColumnName('Num Afiliado'));
  });
});

describe('matchColumns', () => {
  test('match exacto tras normalizar', () => {
    const [result] = matchColumns(['Fecha de Nacimiento'], ['fecha   de nacimiento']);
    expect(result.matchType).toBe('exact');
    expect(result.matchedColumn).toBe('fecha   de nacimiento');
  });

  test('"Fecha Nacimiento" esperada vs "Fecha de Nacimiento" real: fuzzy', () => {
    const [result] = matchColumns(['Fecha Nacimiento'], ['Fecha de Nacimiento']);
    expect(result.matchType).toBe('fuzzy');
    expect(result.matchedColumn).toBe('Fecha de Nacimiento');
  });

  test('columna esperada sin ninguna columna real parecida: not_found', () => {
    const [result] = matchColumns(['Teléfono'], ['Producto', 'Precio', 'Cantidad']);
    expect(result.matchType).toBe('not_found');
    expect(result.matchedColumn).toBeNull();
  });

  test('con 20+ columnas esperadas, corre sin degradar (smoke test de performance)', () => {
    const expectedColumns = Array.from({ length: 25 }, (_, i) => `Columna ${i}`);
    const actualColumns = Array.from({ length: 25 }, (_, i) => `columna_${i}`);

    const start = Date.now();
    const results = matchColumns(expectedColumns, actualColumns);
    const elapsedMs = Date.now() - start;

    expect(results).toHaveLength(25);
    expect(elapsedMs).toBeLessThan(1000);
  });
});
