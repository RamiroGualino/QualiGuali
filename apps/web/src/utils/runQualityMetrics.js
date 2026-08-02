import { resultSuccessPercent } from './resultSuccessPercent';

// Etapa 11, punto 4 ("Gráficos"): 3 métricas derivadas de `run.results` para
// los gráficos del dashboard — ninguna cambia qué evalúa el backend, sólo
// resume lo que ya está en cada resultado.

export function rulesPassFailCounts(results = []) {
  return results.reduce(
    (counts, result) => {
      if (result.status === 'passed') counts.passed += 1;
      else counts.failed += 1;
      return counts;
    },
    { passed: 0, failed: 0 },
  );
}

// Promedio de % de éxito por columna — sólo resultados de scope column
// (`result.column`); Tabla no tiene una columna asociada y Multicolumna
// tiene varias, ninguna de las dos encaja en un gráfico "por columna". Se
// preserva el orden de primera aparición (mismo orden que trae `results`).
export function qualityByColumn(results = []) {
  const order = [];
  const sums = new Map();

  results.forEach((result) => {
    if (!result.column) return;
    if (!sums.has(result.column)) {
      order.push(result.column);
      sums.set(result.column, []);
    }
    sums.get(result.column).push(resultSuccessPercent(result));
  });

  return order.map((column) => {
    const percents = sums.get(column);
    const average = percents.reduce((sum, value) => sum + value, 0) / percents.length;
    return { column, percent: Math.round(average * 100) / 100 };
  });
}

// Cantidad de reglas falladas por columna, de mayor a menor — misma
// limitación que qualityByColumn (sólo scope column).
export function errorDistributionByColumn(results = []) {
  const counts = new Map();

  results.forEach((result) => {
    if (!result.column || result.status !== 'failed') return;
    counts.set(result.column, (counts.get(result.column) || 0) + 1);
  });

  return [...counts.entries()]
    .map(([column, count]) => ({ column, count }))
    .sort((a, b) => b.count - a.count);
}
