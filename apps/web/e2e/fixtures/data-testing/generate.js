/* eslint-disable no-console */
// Etapa 10 (docs/data-testing/etapa-10-e2e-playwright.md): genera los 2
// fixtures binarios que usa data-testing.spec.js — no corre como parte de
// la suite, es un script de un solo uso para (re)generarlos si hace falta
// cambiar los datos. Correr con:
//   node e2e/fixtures/data-testing/generate.js
// desde apps/web/. Mismo patrón que
// services/data-testing-service/tests/__fixtures__/spreadsheets/generate.js.
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function writeWorkbook(filename, rows) {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  XLSX.writeFile(workbook, path.join(__dirname, filename));
}

// reference.xlsx: sube al crear la Suite, sólo para detectar columnas
// (REQ-DT-002) — headers exactos que la Suite va a usar como
// expectedColumns. 3 filas, ninguna viola nada (no importa: la Suite no
// evalúa nada en este paso, sólo lee headers).
writeWorkbook('reference.xlsx', [
  ['dni', 'nombre', 'edad', 'email'],
  ['1001', 'Ana Pérez', 34, 'ana@example.com'],
  ['1002', 'Luis Gómez', 28, 'luis@example.com'],
  ['1003', 'Marta Díaz', 45, 'marta@example.com'],
]);

// run-with-failures.xlsx: el archivo de la Corrida. A propósito:
// - header "nombres" en vez de "nombre" (match fuzzy — Levenshtein
//   similarity ~0.86, por encima del umbral 0.75 de matchColumns).
// - 4 filas (para que "Cantidad de filas = 4" pase).
// - la fila de Carlos Ruiz tiene edad=90, fuera de [18, 65] — hace fallar
//   la expectativa de Columna a propósito (BR-DT-006: su businessId, DNI
//   1004, debe aparecer en affectedRecords).
// - las 4 combinaciones (nombres, email) son todas distintas — la
//   expectativa de Multicolumna (única por fila) pasa.
writeWorkbook('run-with-failures.xlsx', [
  ['dni', 'nombres', 'edad', 'email'],
  ['1001', 'Ana Pérez', 34, 'ana@example.com'],
  ['1002', 'Luis Gómez', 28, 'luis@example.com'],
  ['1003', 'Marta Díaz', 45, 'marta@example.com'],
  ['1004', 'Carlos Ruiz', 90, 'carlos@example.com'],
]);

console.log('Fixtures generados en', __dirname);
