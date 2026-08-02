// Etapa 6.1 (docs/data-testing/etapa-6.1-Rediseño UX.md), sección 8: texto en
// lenguaje natural con el valor real interpolado — usado tanto por la
// previsualización en vivo (mientras se compone la regla, con placeholders
// para lo que falta) como por cada expectativa ya agregada (ExpectationList).
// Misma fuente para ambos casos, así nunca pueden divergir.
const PLACEHOLDER = '___';

// expIds sin ningún input propio — su texto es literalmente el label del
// catálogo (dataTesting.expectations.<expId>), sin interpolar nada.
const NO_PARAMS_EXP_IDS = new Set([
  'EXP-DT-007',
  'EXP-DT-008',
  'EXP-DT-009',
  'EXP-DT-021',
  'EXP-DT-022',
]);

function numOrPlaceholder(value) {
  return value === null || value === undefined || Number.isNaN(value) ? PLACEHOLDER : value;
}

// Trunca a 5 + "y N más" (etapa-6.1 §8) — `list` puede venir `undefined`
// (draft todavía sin completar, para la previsualización en vivo).
function formatList(list, t) {
  if (!list || list.length === 0) return PLACEHOLDER;
  if (list.length <= 5) return list.join(', ');
  return `${list.slice(0, 5).join(', ')}, ${t('dataTesting.andMore', { count: list.length - 5 })}`;
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function dataTypeLabel(type, t) {
  return type ? t(`dataTesting.expectationSelector.type${capitalize(type)}`) : PLACEHOLDER;
}

// `expectation`: { expId, params, column, columns } — no hace falta que esté
// completa (la previsualización en vivo la arma parcial mientras se
// completan los inputs); cualquier valor faltante cae a PLACEHOLDER ("___").
export function formatExpectationText(expectation, t) {
  const { expId, params = {}, columns } = expectation;

  if (NO_PARAMS_EXP_IDS.has(expId)) return t(`dataTesting.expectations.${expId}`);

  switch (expId) {
    case 'EXP-DT-001':
    case 'EXP-DT-003':
      return t(`dataTesting.expectationText.${expId}`, { value: numOrPlaceholder(params.count) });

    case 'EXP-DT-016':
      return t(`dataTesting.expectationText.${expId}`, { value: numOrPlaceholder(params.length) });

    case 'EXP-DT-002':
    case 'EXP-DT-004':
    case 'EXP-DT-012':
    case 'EXP-DT-015':
    case 'EXP-DT-023':
    case 'EXP-DT-024':
    case 'EXP-DT-025':
    case 'EXP-DT-026':
    case 'EXP-DT-027':
    case 'EXP-DT-028':
    case 'EXP-DT-029':
    case 'EXP-DT-031':
      return t(`dataTesting.expectationText.${expId}`, {
        min: numOrPlaceholder(params.min),
        max: numOrPlaceholder(params.max),
      });

    case 'EXP-DT-005':
    case 'EXP-DT-006':
      return t(`dataTesting.expectationText.${expId}`, { list: formatList(params.columns, t) });

    case 'EXP-DT-010':
      return t(`dataTesting.expectationText.${expId}`, { type: dataTypeLabel(params.type, t) });

    case 'EXP-DT-011':
      return t(`dataTesting.expectationText.${expId}`, {
        list:
          params.types && params.types.length > 0
            ? params.types.map((type) => dataTypeLabel(type, t)).join(', ')
            : PLACEHOLDER,
      });

    case 'EXP-DT-013':
    case 'EXP-DT-014':
    case 'EXP-DT-030':
      return t(`dataTesting.expectationText.${expId}`, { list: formatList(params.values, t) });

    case 'EXP-DT-017':
    case 'EXP-DT-018':
      return t(`dataTesting.expectationText.${expId}`, { pattern: params.pattern || PLACEHOLDER });

    case 'EXP-DT-019':
    case 'EXP-DT-020':
      return t(`dataTesting.expectationText.${expId}`, {
        count: params.patterns ? params.patterns.length : 0,
      });

    case 'EXP-DT-032': {
      // Reusa la misma clave "Or equal" del selector (en vez de una nueva),
      // en minúscula entre paréntesis — mismo resultado que pide etapa-6.1
      // (" (o igual)") sin duplicar el string.
      const orEqualSuffix = params.orEqual
        ? ` (${t('dataTesting.expectationSelector.orEqual').toLowerCase()})`
        : '';
      return t(`dataTesting.expectationText.${expId}`, {
        colA: columns?.[0] || PLACEHOLDER,
        colB: columns?.[1] || PLACEHOLDER,
        orEqualSuffix,
      });
    }

    case 'EXP-DT-033':
      return t(`dataTesting.expectationText.${expId}`, {
        colA: columns?.[0] || PLACEHOLDER,
        colB: columns?.[1] || PLACEHOLDER,
      });

    case 'EXP-DT-034':
      return t(`dataTesting.expectationText.${expId}`, { list: formatList(columns, t) });

    case 'EXP-DT-035':
      return t(`dataTesting.expectationText.${expId}`, {
        list: columns && columns.length > 0 ? columns.join(' + ') : PLACEHOLDER,
        target: numOrPlaceholder(params.target),
      });

    default:
      return '';
  }
}
