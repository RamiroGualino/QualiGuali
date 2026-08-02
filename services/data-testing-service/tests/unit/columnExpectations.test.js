const column = require('../../src/engine/columnExpectations');

const defaultOpts = { threshold: 100, sampleLimit: 20, businessIdColumn: null };

function records(values) {
  return values.map((value, index) => ({ _rowId: index + 1, campo: value }));
}

describe('EXP-DT-007 notNull', () => {
  // Ejemplo de etapa-3: 2 de 10 valores nulos -> successPercent: 80, con los
  // 2 rowId correspondientes en affectedRecords.
  test('dataset con 2 de 10 nulos: successPercent 80, falla, rowId correctos', () => {
    const data = records(['a', 'b', 'c', null, 'e', 'f', 'g', 'h', null, 'j']);
    const result = column.notNull(data, 'campo', {}, defaultOpts);

    expect(result.status).toBe('failed');
    expect(result.successPercent).toBe(80);
    expect(result.affectedRecords.map((r) => r.rowId)).toEqual([4, 9]);
  });

  test('pasa cuando no hay valores nulos/vacíos', () => {
    const data = records(['a', 'b', 'c']);
    expect(column.notNull(data, 'campo', {}, defaultOpts).status).toBe('passed');
  });
});

describe('EXP-DT-008 isNull', () => {
  test('pasa cuando todos los valores están vacíos', () => {
    const data = records([null, '', null]);
    expect(column.isNull(data, 'campo', {}, defaultOpts).status).toBe('passed');
  });

  test('falla cuando hay algún valor cargado', () => {
    const data = records([null, 'x']);
    expect(column.isNull(data, 'campo', {}, defaultOpts).status).toBe('failed');
  });
});

describe('EXP-DT-009 isUnique', () => {
  test('pasa cuando todos los valores son distintos', () => {
    const data = records(['a', 'b', 'c']);
    expect(column.isUnique(data, 'campo', {}, defaultOpts).status).toBe('passed');
  });

  test('falla y marca ambas filas de un valor duplicado', () => {
    const data = records(['a', 'b', 'a']);
    const result = column.isUnique(data, 'campo', {}, defaultOpts);
    expect(result.status).toBe('failed');
    expect(result.affectedRecords.map((r) => r.rowId)).toEqual([1, 3]);
  });
});

describe('EXP-DT-010 isOfType', () => {
  test('pasa cuando todos los valores son del tipo pedido', () => {
    const data = records([10, 20, 30]);
    expect(column.isOfType(data, 'campo', { type: 'number' }, defaultOpts).status).toBe('passed');
  });

  test('falla cuando algún valor no es de ese tipo', () => {
    const data = records([10, 'veinte', 30]);
    expect(column.isOfType(data, 'campo', { type: 'number' }, defaultOpts).status).toBe('failed');
  });
});

describe('EXP-DT-011 isInTypeList', () => {
  test('pasa cuando el tipo de cada valor está en la lista', () => {
    const data = records([10, 'veinte', true]);
    const result = column.isInTypeList(data, 'campo', { types: ['number', 'text', 'boolean'] }, defaultOpts);
    expect(result.status).toBe('passed');
  });

  test('falla cuando algún tipo no está en la lista', () => {
    const data = records([10, 'veinte']);
    const result = column.isInTypeList(data, 'campo', { types: ['number'] }, defaultOpts);
    expect(result.status).toBe('failed');
  });
});

describe('EXP-DT-012 isBetween', () => {
  test('valores fuera de rango cuentan como no conformes', () => {
    const data = records([10, 50, 150]);
    const result = column.isBetween(data, 'campo', { min: 0, max: 100 }, defaultOpts);
    expect(result.status).toBe('failed');
    expect(result.unexpectedSample).toEqual([150]);
  });

  test('pasa cuando todos los valores están dentro del rango', () => {
    const data = records([10, 50, 90]);
    expect(column.isBetween(data, 'campo', { min: 0, max: 100 }, defaultOpts).status).toBe('passed');
  });
});

describe('EXP-DT-013 isInSet', () => {
  test('pasa cuando todos los valores están en el conjunto', () => {
    const data = records(['activo', 'inactivo']);
    expect(column.isInSet(data, 'campo', { values: ['activo', 'inactivo'] }, defaultOpts).status).toBe(
      'passed',
    );
  });

  test('falla cuando algún valor no está en el conjunto', () => {
    const data = records(['activo', 'pendiente']);
    expect(column.isInSet(data, 'campo', { values: ['activo', 'inactivo'] }, defaultOpts).status).toBe(
      'failed',
    );
  });
});

describe('EXP-DT-014 isNotInSet', () => {
  test('pasa cuando ningún valor está en el conjunto prohibido', () => {
    const data = records(['activo']);
    expect(column.isNotInSet(data, 'campo', { values: ['baneado'] }, defaultOpts).status).toBe('passed');
  });

  test('falla cuando algún valor está en el conjunto prohibido', () => {
    const data = records(['baneado']);
    expect(column.isNotInSet(data, 'campo', { values: ['baneado'] }, defaultOpts).status).toBe('failed');
  });
});

describe('EXP-DT-015 lengthBetween', () => {
  test('pasa cuando la longitud está en rango', () => {
    const data = records(['12345678']);
    expect(column.lengthBetween(data, 'campo', { min: 6, max: 10 }, defaultOpts).status).toBe('passed');
  });

  test('falla cuando la longitud está fuera de rango', () => {
    const data = records(['123']);
    expect(column.lengthBetween(data, 'campo', { min: 6, max: 10 }, defaultOpts).status).toBe('failed');
  });
});

describe('EXP-DT-016 lengthEquals', () => {
  test('pasa cuando la longitud es exacta', () => {
    const data = records(['12345678']);
    expect(column.lengthEquals(data, 'campo', { length: 8 }, defaultOpts).status).toBe('passed');
  });

  test('falla cuando la longitud no es exacta', () => {
    const data = records(['123']);
    expect(column.lengthEquals(data, 'campo', { length: 8 }, defaultOpts).status).toBe('failed');
  });
});

describe('EXP-DT-017 matchesRegex', () => {
  test('valores que no matchean el patrón aparecen en unexpectedSample', () => {
    const data = records(['ana@mail.com', 'no-es-un-mail']);
    const result = column.matchesRegex(data, 'campo', { pattern: '^[^@]+@[^@]+\\.[^@]+$' }, defaultOpts);
    expect(result.status).toBe('failed');
    expect(result.unexpectedSample).toEqual(['no-es-un-mail']);
  });

  test('pasa cuando todos los valores matchean', () => {
    const data = records(['ana@mail.com', 'luis@mail.com']);
    const result = column.matchesRegex(data, 'campo', { pattern: '^[^@]+@[^@]+\\.[^@]+$' }, defaultOpts);
    expect(result.status).toBe('passed');
  });
});

describe('EXP-DT-018 notMatchesRegex', () => {
  test('pasa cuando ningún valor matchea el patrón prohibido', () => {
    const data = records(['hola mundo']);
    expect(column.notMatchesRegex(data, 'campo', { pattern: '\\d' }, defaultOpts).status).toBe('passed');
  });

  test('falla cuando algún valor matchea el patrón prohibido', () => {
    const data = records(['hay un 1 acá']);
    expect(column.notMatchesRegex(data, 'campo', { pattern: '\\d' }, defaultOpts).status).toBe('failed');
  });
});

describe('EXP-DT-019 matchesRegexList', () => {
  test('pasa cuando cada valor matchea al menos uno de los patrones', () => {
    const data = records(['ABC123', 'XYZ999']);
    const result = column.matchesRegexList(data, 'campo', { patterns: ['^[A-Z]{3}\\d{3}$'] }, defaultOpts);
    expect(result.status).toBe('passed');
  });

  test('falla cuando algún valor no matchea ninguno', () => {
    const data = records(['ABC123', 'nope']);
    const result = column.matchesRegexList(data, 'campo', { patterns: ['^[A-Z]{3}\\d{3}$'] }, defaultOpts);
    expect(result.status).toBe('failed');
  });
});

describe('EXP-DT-020 notMatchesRegexList', () => {
  test('pasa cuando ningún valor matchea ninguno de los patrones prohibidos', () => {
    const data = records(['hola']);
    const result = column.notMatchesRegexList(data, 'campo', { patterns: ['\\d', '@'] }, defaultOpts);
    expect(result.status).toBe('passed');
  });

  test('falla cuando algún valor matchea alguno de los patrones prohibidos', () => {
    const data = records(['hola@mundo']);
    const result = column.notMatchesRegexList(data, 'campo', { patterns: ['\\d', '@'] }, defaultOpts);
    expect(result.status).toBe('failed');
  });
});

describe('EXP-DT-021 isDateutilParseable', () => {
  test('pasa cuando todos los valores son parseables como fecha', () => {
    const data = records(['2024-01-15', '2024-06-30']);
    expect(column.isDateutilParseable(data, 'campo', {}, defaultOpts).status).toBe('passed');
  });

  test('falla cuando algún valor no es parseable como fecha', () => {
    const data = records(['2024-01-15', 'no es una fecha']);
    expect(column.isDateutilParseable(data, 'campo', {}, defaultOpts).status).toBe('failed');
  });
});

describe('EXP-DT-022 isJsonParseable', () => {
  test('pasa cuando todos los valores son JSON válido', () => {
    const data = records(['{"a":1}', '[1,2,3]']);
    expect(column.isJsonParseable(data, 'campo', {}, defaultOpts).status).toBe('passed');
  });

  test('falla cuando algún valor no es JSON válido', () => {
    const data = records(['{"a":1}', '{no valido']);
    expect(column.isJsonParseable(data, 'campo', {}, defaultOpts).status).toBe('failed');
  });
});

describe('EXP-DT-023 maxBetween', () => {
  test('pasa cuando el máximo real está en rango', () => {
    const data = records([10, 50, 90]);
    expect(column.maxBetween(data, 'campo', { min: 80, max: 100 }).status).toBe('passed');
  });

  test('falla cuando el máximo real está fuera de rango', () => {
    const data = records([10, 50, 90]);
    expect(column.maxBetween(data, 'campo', { min: 0, max: 50 }).status).toBe('failed');
  });
});

describe('EXP-DT-024 minBetween', () => {
  test('pasa cuando el mínimo real está en rango', () => {
    const data = records([10, 50, 90]);
    expect(column.minBetween(data, 'campo', { min: 0, max: 20 }).status).toBe('passed');
  });

  test('falla cuando el mínimo real está fuera de rango', () => {
    const data = records([10, 50, 90]);
    expect(column.minBetween(data, 'campo', { min: 50, max: 100 }).status).toBe('failed');
  });
});

describe('EXP-DT-025 meanBetween', () => {
  // Ejemplo de etapa-3: calcula la media real del dataset y compara contra
  // el rango — [10, 20, 30] -> media 20.
  test('calcula la media real y pasa cuando está en rango', () => {
    const data = records([10, 20, 30]);
    const result = column.meanBetween(data, 'campo', { min: 15, max: 25 });
    expect(result.status).toBe('passed');
  });

  test('falla cuando la media real está fuera de rango', () => {
    const data = records([10, 20, 30]);
    const result = column.meanBetween(data, 'campo', { min: 50, max: 60 });
    expect(result.status).toBe('failed');
    expect(result.unexpectedSample).toEqual([20]);
  });
});

describe('EXP-DT-026 medianBetween', () => {
  test('pasa cuando la mediana real está en rango', () => {
    const data = records([10, 20, 30]);
    expect(column.medianBetween(data, 'campo', { min: 15, max: 25 }).status).toBe('passed');
  });

  test('falla cuando la mediana real está fuera de rango', () => {
    const data = records([10, 20, 30]);
    expect(column.medianBetween(data, 'campo', { min: 50, max: 60 }).status).toBe('failed');
  });
});

describe('EXP-DT-027 stdevBetween', () => {
  test('pasa cuando el desvío estándar real está en rango', () => {
    const data = records([10, 10, 10]);
    expect(column.stdevBetween(data, 'campo', { min: 0, max: 1 }).status).toBe('passed');
  });

  test('falla cuando el desvío estándar real está fuera de rango', () => {
    const data = records([0, 100, 200]);
    expect(column.stdevBetween(data, 'campo', { min: 0, max: 1 }).status).toBe('failed');
  });
});

describe('EXP-DT-028 uniqueValueCountBetween', () => {
  test('pasa cuando la cantidad de valores únicos está en rango', () => {
    const data = records(['a', 'b', 'c', 'a']);
    expect(column.uniqueValueCountBetween(data, 'campo', { min: 2, max: 5 }).status).toBe('passed');
  });

  test('falla cuando la cantidad de valores únicos está fuera de rango', () => {
    const data = records(['a', 'b', 'c']);
    expect(column.uniqueValueCountBetween(data, 'campo', { min: 10, max: 20 }).status).toBe('failed');
  });
});

describe('EXP-DT-029 proportionOfUniqueBetween', () => {
  test('pasa cuando la proporción de únicos está en rango', () => {
    const data = records(['a', 'b', 'c', 'd']); // 4/4 únicos = 1.0
    expect(column.proportionOfUniqueBetween(data, 'campo', { min: 0.9, max: 1 }).status).toBe('passed');
  });

  test('falla cuando la proporción de únicos está fuera de rango', () => {
    const data = records(['a', 'a', 'a', 'b']); // 2/4 únicos = 0.5
    expect(column.proportionOfUniqueBetween(data, 'campo', { min: 0.9, max: 1 }).status).toBe('failed');
  });
});

describe('EXP-DT-030 mostCommonValueInSet', () => {
  test('pasa cuando el valor más común está en el conjunto', () => {
    const data = records(['activo', 'activo', 'inactivo']);
    expect(column.mostCommonValueInSet(data, 'campo', { values: ['activo'] }).status).toBe('passed');
  });

  test('falla cuando el valor más común no está en el conjunto', () => {
    const data = records(['inactivo', 'inactivo', 'activo']);
    expect(column.mostCommonValueInSet(data, 'campo', { values: ['activo'] }).status).toBe('failed');
  });
});

describe('EXP-DT-031 sumBetween', () => {
  test('pasa cuando la suma real está en rango', () => {
    const data = records([10, 20, 30]); // suma 60
    expect(column.sumBetween(data, 'campo', { min: 50, max: 70 }).status).toBe('passed');
  });

  test('falla cuando la suma real está fuera de rango', () => {
    const data = records([10, 20, 30]);
    expect(column.sumBetween(data, 'campo', { min: 0, max: 10 }).status).toBe('failed');
  });
});

describe('threshold (BR-DT-004)', () => {
  test('mismo dataset, distinto threshold: cambia el status aunque el successPercent sea igual', () => {
    const data = records(['a', 'b', 'c', 'd', null, null, null]); // 4/7 = 57.14%
    const strict = column.notNull(data, 'campo', {}, { ...defaultOpts, threshold: 100 });
    const lenient = column.notNull(data, 'campo', {}, { ...defaultOpts, threshold: 50 });

    expect(strict.successPercent).toBe(lenient.successPercent);
    expect(strict.status).toBe('failed');
    expect(lenient.status).toBe('passed');
  });
});

describe('sampleLimit (REQ-DT-006)', () => {
  test('dataset con 50 fallos y sampleLimit 20: unexpectedSample.length === 20, totalUnexpected === 50', () => {
    const data = records(Array.from({ length: 50 }, () => null));
    const result = column.notNull(data, 'campo', {}, { ...defaultOpts, sampleLimit: 20 });

    expect(result.unexpectedSample).toHaveLength(20);
    expect(result.totalUnexpected).toBe(50);
  });
});

describe('businessIdColumn (BR-DT-006)', () => {
  test('fila fallida sin valor en la columna identificadora: businessId null, campo no se omite', () => {
    const data = [
      { _rowId: 1, campo: null, dni: null },
      { _rowId: 2, campo: null, dni: '30111111' },
    ];
    const result = column.notNull(data, 'campo', {}, { ...defaultOpts, businessIdColumn: 'dni' });

    expect(result.affectedRecords).toEqual([
      { rowId: 1, businessId: null },
      { rowId: 2, businessId: '30111111' },
    ]);
  });
});
