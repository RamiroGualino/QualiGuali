import { resultSuccessPercent } from './resultSuccessPercent';

// Etapa 11 (docs/data-testing/etapa-11-rediseno-reporte-ejecucion.md),
// "Data Quality Score": una métrica derivada, calculada acá a partir de
// datos que `run.results` ya trae — no es un campo nuevo del backend, no
// cambia qué se evalúa ni cómo. Por expectativa: su propio `successPercent`
// si lo tiene (scope column/multicolumn); si no (scope table, estructural,
// sin tally por fila) cuenta 100 si pasó, 0 si falló (resultSuccessPercent,
// el mismo criterio que usa la barra de "% Éxito" de cada regla en
// RuleResultCard). El score final es el promedio de todas, redondeado — 100
// = calidad perfecta.
export function calculateDataQualityScore(results = []) {
  if (results.length === 0) return null;

  const total = results.reduce((sum, result) => sum + resultSuccessPercent(result), 0);

  return Math.round(total / results.length);
}

// 80-100 verde, 40-80 ámbar, 0-40 rojo (umbrales pedidos para el score,
// ajustados por el usuario tras ver el primer resultado) — `null` (sin
// resultados) cae en 'neutral', ninguna corrida real llega ahí.
export function dataQualityScoreTone(score) {
  if (score === null || score === undefined) return 'neutral';
  if (score >= 80) return 'pass';
  if (score >= 40) return 'warning';
  return 'fail';
}
