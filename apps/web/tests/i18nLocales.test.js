import { describe, test, expect } from 'vitest';
import es from '../src/i18n/locales/es.json';
import en from '../src/i18n/locales/en.json';

// Etapa 9 (docs/data-testing/etapa-9-i18n-navegacion.md): evita el típico
// bug de "falta traducir una clave en un idioma" — compara recursivamente
// el árbol de claves de es.json y en.json (no los valores, que deben
// diferir) en todo el archivo, no solo el namespace dataTesting.
function collectKeyPaths(node, prefix = '') {
  return Object.entries(node).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return collectKeyPaths(value, path);
    }
    return [path];
  });
}

describe('i18n locales', () => {
  test('es.json y en.json tienen exactamente el mismo set de keys', () => {
    const esKeys = collectKeyPaths(es).sort();
    const enKeys = collectKeyPaths(en).sort();

    expect(esKeys).toEqual(enKeys);
  });
});
