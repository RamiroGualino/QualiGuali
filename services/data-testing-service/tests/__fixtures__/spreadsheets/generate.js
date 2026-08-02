/* eslint-disable no-console */
// Genera los fixtures binarios (.xlsx, .ods) de esta carpeta a partir de la
// misma data en memoria — no se ejecuta como parte de la suite de tests,
// es un script de un solo uso para (re)generar los fixtures si hace falta
// cambiarlos. Correr con: `node tests/__fixtures__/spreadsheets/generate.js`
// desde la raíz de data-testing-service.
const path = require('path');
const XLSX = require('xlsx');

const HEADERS = ['nombre', 'edad', 'email'];
const ROWS = [
  ['Ana Pérez', 34, 'ana@example.com'],
  ['Luis Gómez', 28, 'luis@example.com'],
  ['Marta Díaz', 45, 'marta@example.com'],
];

function writeWorkbook(filename, rows) {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  XLSX.writeFile(workbook, path.join(__dirname, filename));
}

writeWorkbook('valid.xlsx', [HEADERS, ...ROWS]);
writeWorkbook('valid.ods', [HEADERS, ...ROWS]);
writeWorkbook('empty.xlsx', [HEADERS]); // solo headers, sin filas de datos

console.log('Fixtures generados en', __dirname);
