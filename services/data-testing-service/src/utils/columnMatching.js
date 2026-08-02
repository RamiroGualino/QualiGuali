// Etapa 2 (docs/data-testing/etapa-2-parser-y-matching.md), BR-DT-002:
// normaliza antes de comparar (minusculas, sin tildes, sin espacios
// repetidos/al borde) - "Fecha de Nacimiento" y "fecha   de nacimiento"
// deben normalizar igual. Tambien quita puntuacion (ej. abreviaturas con
// punto: "Num. Afiliado" y "Num Afiliado" deben normalizar igual tambien).
function normalizeColumnName(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita diacriticos (tildes) dejados por NFD
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // quita puntuacion (ej. "num." -> "num")
    .trim()
    .replace(/\s+/g, ' ');
}

// Distancia de Levenshtein, DP iterativa O(n*m) tiempo / O(min(n,m)) espacio
// — implementación pura, sin dependencia externa (BR-DT-002's propia nota:
// "es chico, no amerita paquete nuevo").
function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Mantiene `a` como la cadena más corta para minimizar el ancho de la fila.
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  let previousRow = Array.from({ length: shorter.length + 1 }, (_, i) => i);

  for (let i = 1; i <= longer.length; i += 1) {
    const currentRow = [i];
    for (let j = 1; j <= shorter.length; j += 1) {
      const cost = longer[i - 1] === shorter[j - 1] ? 0 : 1;
      currentRow.push(
        Math.min(
          currentRow[j - 1] + 1, // inserción
          previousRow[j] + 1, // eliminación
          previousRow[j - 1] + cost, // sustitución
        ),
      );
    }
    previousRow = currentRow;
  }

  return previousRow[shorter.length];
}

// 1 = idénticas, 0 = completamente distintas — normalizada por la longitud
// de la cadena más larga, para que columnas largas no penalicen de más una
// diferencia de pocos caracteres.
function similarity(a, b) {
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLength;
}

const DEFAULT_FUZZY_THRESHOLD = 0.75;

// Compara columnas esperadas (de la Suite) contra las columnas reales de un
// archivo. NO decide nada por su cuenta más allá de sugerir (etapa-2's
// propia nota) — la decisión final (confirmar / corregir a mano / marcar
// "no está en este archivo") es responsabilidad del caller.
function matchColumns(expectedColumns, actualColumns, { fuzzyThreshold = DEFAULT_FUZZY_THRESHOLD } = {}) {
  const normalizedActual = actualColumns.map((actualColumn) => ({
    actualColumn,
    normalized: normalizeColumnName(actualColumn),
  }));

  return expectedColumns.map((expectedColumn) => {
    const normalizedExpected = normalizeColumnName(expectedColumn);

    const exactMatch = normalizedActual.find(({ normalized }) => normalized === normalizedExpected);
    if (exactMatch) {
      return {
        expectedColumn,
        matchedColumn: exactMatch.actualColumn,
        matchType: 'exact',
        confidence: 1,
      };
    }

    let best = null;
    let bestScore = 0;
    normalizedActual.forEach(({ actualColumn, normalized }) => {
      const score = similarity(normalizedExpected, normalized);
      if (score > bestScore) {
        bestScore = score;
        best = actualColumn;
      }
    });

    if (best && bestScore >= fuzzyThreshold) {
      return { expectedColumn, matchedColumn: best, matchType: 'fuzzy', confidence: bestScore };
    }

    return { expectedColumn, matchedColumn: null, matchType: 'not_found', confidence: bestScore };
  });
}

module.exports = { normalizeColumnName, matchColumns };
