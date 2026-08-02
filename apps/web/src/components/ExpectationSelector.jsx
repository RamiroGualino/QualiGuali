import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { TagInput } from './TagInput';
import { formatExpectationText } from '../utils/expectationText';
import styles from './ExpectationSelector.module.css';

// Etapa 6 (docs/data-testing/etapa-6-frontend-suites.md), reescrito en la
// Etapa 6.1 (docs/data-testing/etapa-6.1-Rediseño UX.md): panel de
// alta/edición de una expectativa — ya NO renderiza la lista de
// expectativas agregadas (eso pasó a ExpectationList, en el panel de al
// lado). Metadata estructural del catálogo (etapa-0 sección 6) — el texto
// de cada label sale de i18n (dataTesting.expectations.<expId>), esto acá
// sólo describe QUÉ inputs mostrar por expId (la tabla de la etapa-0,
// columna "Input(s)").
const TABLE_EXPECTATIONS = [
  { expId: 'EXP-DT-001', inputs: ['count'] },
  { expId: 'EXP-DT-002', inputs: ['min', 'max'] },
  { expId: 'EXP-DT-003', inputs: ['count'] },
  { expId: 'EXP-DT-004', inputs: ['min', 'max'] },
  { expId: 'EXP-DT-005', inputs: ['columnList'] },
  { expId: 'EXP-DT-006', inputs: ['columnList'] },
];

const COLUMN_EXPECTATIONS = [
  { expId: 'EXP-DT-007', group: 'absenceType', inputs: [] },
  { expId: 'EXP-DT-008', group: 'absenceType', inputs: [] },
  { expId: 'EXP-DT-009', group: 'absenceType', inputs: [] },
  { expId: 'EXP-DT-010', group: 'absenceType', inputs: ['dataType'] },
  { expId: 'EXP-DT-011', group: 'absenceType', inputs: ['typeList'] },
  { expId: 'EXP-DT-012', group: 'rangeSet', inputs: ['min', 'max'] },
  { expId: 'EXP-DT-013', group: 'rangeSet', inputs: ['values'] },
  { expId: 'EXP-DT-014', group: 'rangeSet', inputs: ['values'] },
  { expId: 'EXP-DT-015', group: 'text', inputs: ['min', 'max'] },
  { expId: 'EXP-DT-016', group: 'text', inputs: ['length'] },
  { expId: 'EXP-DT-017', group: 'text', inputs: ['pattern'] },
  { expId: 'EXP-DT-018', group: 'text', inputs: ['pattern'] },
  { expId: 'EXP-DT-019', group: 'text', inputs: ['patternList'] },
  { expId: 'EXP-DT-020', group: 'text', inputs: ['patternList'] },
  { expId: 'EXP-DT-021', group: 'text', inputs: [] },
  { expId: 'EXP-DT-022', group: 'text', inputs: [] },
  { expId: 'EXP-DT-023', group: 'stats', inputs: ['min', 'max'] },
  { expId: 'EXP-DT-024', group: 'stats', inputs: ['min', 'max'] },
  { expId: 'EXP-DT-025', group: 'stats', inputs: ['min', 'max'] },
  { expId: 'EXP-DT-026', group: 'stats', inputs: ['min', 'max'] },
  { expId: 'EXP-DT-027', group: 'stats', inputs: ['min', 'max'] },
  { expId: 'EXP-DT-028', group: 'stats', inputs: ['min', 'max'] },
  { expId: 'EXP-DT-029', group: 'stats', inputs: ['min', 'max'] },
  { expId: 'EXP-DT-030', group: 'stats', inputs: ['values'] },
  { expId: 'EXP-DT-031', group: 'stats', inputs: ['min', 'max'] },
];

const MULTICOLUMN_EXPECTATIONS = [
  { expId: 'EXP-DT-032', inputs: ['orEqual'] },
  { expId: 'EXP-DT-033', inputs: [] },
  { expId: 'EXP-DT-034', inputs: [] },
  { expId: 'EXP-DT-035', inputs: ['target'] },
];

const GROUP_ORDER = ['absenceType', 'rangeSet', 'text', 'stats'];
const DATA_TYPES = ['text', 'number', 'date', 'boolean'];

// Etapa 6.2 (docs/data-testing/etapa-6.2-selector-por-tipo-de-dato.md): qué
// expectativas de Columna tiene sentido ofrecer según el `tipoDato` de la
// columna elegida — definido a mano por el usuario, nunca inferido. Las
// "universales" se muestran siempre, sea cual sea el tipo.
const UNIVERSAL_COLUMN_EXP_IDS = [
  'EXP-DT-007',
  'EXP-DT-008',
  'EXP-DT-009',
  'EXP-DT-010',
  'EXP-DT-011',
  'EXP-DT-013',
  'EXP-DT-014',
  'EXP-DT-028',
  'EXP-DT-029',
  'EXP-DT-030',
];
const COLUMN_EXP_IDS_BY_TYPE = {
  numero: ['EXP-DT-012', 'EXP-DT-023', 'EXP-DT-024', 'EXP-DT-025', 'EXP-DT-026', 'EXP-DT-027', 'EXP-DT-031'],
  texto: ['EXP-DT-015', 'EXP-DT-016', 'EXP-DT-017', 'EXP-DT-018', 'EXP-DT-019', 'EXP-DT-020', 'EXP-DT-022'],
  fecha: ['EXP-DT-012', 'EXP-DT-021', 'EXP-DT-023', 'EXP-DT-024'],
};

// `null` = sin filtro (tipoDato 'sin_definir', o el escape hatch activo) —
// catálogo completo de 25, tal como estaba antes de esta etapa.
function allowedColumnExpIds(tipoDato) {
  if (!tipoDato || tipoDato === 'sin_definir') return null;
  return new Set([...UNIVERSAL_COLUMN_EXP_IDS, ...(COLUMN_EXP_IDS_BY_TYPE[tipoDato] || [])]);
}

// values/patternList/columnList son arrays (Etapa 6.1: TagInput, ya no
// texto separado por coma/línea).
const EMPTY_DRAFT = {
  count: '',
  min: '',
  max: '',
  length: '',
  target: '',
  pattern: '',
  patternList: [],
  values: [],
  columnList: [],
  dataType: 'text',
  typeList: [],
  orEqual: false,
};

function catalogFor(scope) {
  if (scope === 'table') return TABLE_EXPECTATIONS;
  if (scope === 'column') return COLUMN_EXPECTATIONS;
  return MULTICOLUMN_EXPECTATIONS;
}

// El tipo de columna (Etapa 6.2, español: numero/texto/fecha/sin_definir) y
// el `dataType` que pide EXP-DT-010/011 (Etapa 6, inglés: text/number/date/
// boolean — incluye 'boolean', que el selector de columna no tiene) son dos
// vocabularios distintos con el mismo significado de fondo — sin este mapeo
// se le pregunta al usuario "qué tipo de dato es esto" dos veces seguidas
// (una vez arriba para filtrar el catálogo, otra acá para EXP-DT-010/011).
function columnTipoDatoToExpectationDataType(tipoDato) {
  if (tipoDato === 'numero') return 'number';
  if (tipoDato === 'texto') return 'text';
  if (tipoDato === 'fecha') return 'date';
  return null; // sin_definir — no hay nada razonable para precargar
}

// Precarga el draft con los valores reales del archivo de referencia en vez
// de arrancar vacío, para las expectativas de nivel Tabla donde ese valor
// "correcto" es no ambiguo: cantidad de filas (EXP-DT-001) y cantidad de
// columnas (EXP-DT-003) vienen del archivo ya subido; la lista de columnas
// (EXP-DT-005/006) también, en el orden detectado. Nivel Columna:
// EXP-DT-010/011 (mismo motivo, ver columnTipoDatoToExpectationDataType).
// El resto (rangos, texto, estadísticas) no tiene un único valor "correcto"
// para adivinar, así que sigue arrancando vacío. `rowCount` puede ser `null`
// (todavía no se subió ningún archivo de referencia) — en ese caso
// EXP-DT-001 también arranca vacío. No reactivo a cambios posteriores de
// `columns`/`rowCount`/`columnType` (sólo se calcula al elegir el tipo) —
// evita un useEffect (`react-hooks/set-state-in-effect` está prohibido en
// este repo).
function prefillDraftFor(scope, expId, columns, rowCount, columnType) {
  if (scope === 'table') {
    if (expId === 'EXP-DT-001') {
      return rowCount === null ? EMPTY_DRAFT : { ...EMPTY_DRAFT, count: String(rowCount) };
    }
    if (expId === 'EXP-DT-003') {
      return columns.length === 0 ? EMPTY_DRAFT : { ...EMPTY_DRAFT, count: String(columns.length) };
    }
    if (expId === 'EXP-DT-005' || expId === 'EXP-DT-006') {
      return columns.length === 0
        ? EMPTY_DRAFT
        : { ...EMPTY_DRAFT, columnList: columns.map((column) => column.name) };
    }
  }
  if (scope === 'column') {
    const mappedType = columnTipoDatoToExpectationDataType(columnType);
    if (mappedType && expId === 'EXP-DT-010') return { ...EMPTY_DRAFT, dataType: mappedType };
    if (mappedType && expId === 'EXP-DT-011') return { ...EMPTY_DRAFT, typeList: [mappedType] };
  }
  return EMPTY_DRAFT;
}

// Inverso de buildParams — hidrata el draft desde una expectativa ya
// guardada (modo edición), leyendo sólo las claves que su propio catálogo
// declara en `inputs`.
function draftFromExpectation(expectation) {
  const catalog = catalogFor(expectation.scope);
  const entry = catalog.find((e) => e.expId === expectation.expId);
  if (!entry) return EMPTY_DRAFT;
  const params = expectation.params || {};
  const draft = { ...EMPTY_DRAFT };
  entry.inputs.forEach((kind) => {
    if (kind === 'count') draft.count = String(params.count ?? '');
    if (kind === 'min') draft.min = String(params.min ?? '');
    if (kind === 'max') draft.max = String(params.max ?? '');
    if (kind === 'length') draft.length = String(params.length ?? '');
    if (kind === 'target') draft.target = String(params.target ?? '');
    if (kind === 'pattern') draft.pattern = params.pattern || '';
    if (kind === 'patternList') draft.patternList = params.patterns || [];
    if (kind === 'values') draft.values = params.values || [];
    if (kind === 'columnList') draft.columnList = params.columns || [];
    if (kind === 'dataType') draft.dataType = params.type || 'text';
    if (kind === 'typeList') draft.typeList = params.types || [];
    if (kind === 'orEqual') draft.orEqual = Boolean(params.orEqual);
  });
  return draft;
}

// Arma `params` según los `inputs` que ese expId declara — un kind que
// todavía no está completo (isInputFilled) queda afuera de `params` en vez
// de forzarse a NaN/0/[] (necesario para la previsualización en vivo, que
// arma esto mismo sobre un draft a medio completar); al momento de
// submeter de verdad, `canSubmit` ya garantizó que todo lo requerido esté
// lleno, así que el resultado es idéntico al de antes en ese caso.
function buildParams(inputs, draft) {
  const params = {};
  inputs.forEach((kind) => {
    if (!isInputFilled(kind, draft)) return;
    if (kind === 'count') params.count = Number(draft.count);
    if (kind === 'min') params.min = Number(draft.min);
    if (kind === 'max') params.max = Number(draft.max);
    if (kind === 'length') params.length = Number(draft.length);
    if (kind === 'target') params.target = Number(draft.target);
    if (kind === 'pattern') params.pattern = draft.pattern;
    if (kind === 'patternList') params.patterns = draft.patternList;
    if (kind === 'values') params.values = draft.values;
    if (kind === 'columnList') params.columns = draft.columnList;
    if (kind === 'dataType') params.type = draft.dataType;
    if (kind === 'typeList') params.types = draft.typeList;
    if (kind === 'orEqual') params.orEqual = draft.orEqual;
  });
  return params;
}

// Un input queda "sin completar" si su valor crudo está vacío — usado tanto
// para deshabilitar "Agregar"/"Guardar cambios" como para decidir qué
// entra en buildParams.
function isInputFilled(kind, draft) {
  if (kind === 'count') return draft.count !== '';
  if (kind === 'min') return draft.min !== '';
  if (kind === 'max') return draft.max !== '';
  if (kind === 'length') return draft.length !== '';
  if (kind === 'target') return draft.target !== '';
  if (kind === 'pattern') return draft.pattern.trim() !== '';
  if (kind === 'patternList') return draft.patternList.length > 0;
  if (kind === 'values') return draft.values.length > 0;
  if (kind === 'columnList') return draft.columnList.length > 0;
  if (kind === 'dataType') return true; // siempre tiene un default
  if (kind === 'typeList') return draft.typeList.length > 0;
  if (kind === 'orEqual') return true; // checkbox, siempre "completo"
  return true;
}

// Etapa-0 sección 6, columna "Input(s) en el formulario" — cada expId sabe
// qué inputs mostrar; acá se renderizan dinámicamente según `inputs`.
//
// `activeTab` es controlado desde afuera (el padre necesita saberlo para
// filtrar ExpectationList por la misma pestaña activa) — `onTabChange`
// avisa cada click de pestaña. `initialColumn`/`initialColumns`/
// `initialExpectation` en cambio sólo se leen una vez, al montar (useState
// perezoso): el padre fuerza un remount completo con `key` cuando quiere
// re-sembrarlos (click en una pastilla de columna, "Editar" sobre una
// expectativa existente, "Cancelar"), en vez de reaccionar a props nuevas
// vía efecto (prohibido en este repo).
export function ExpectationSelector({
  columns = [],
  rowCount = null,
  activeTab = 'table',
  onTabChange = () => {},
  onColumnTypeChange = () => {},
  initialColumn = '',
  initialColumns = [],
  initialExpectation = null,
  isEditing = false,
  onSubmit = () => {},
  onCancelEdit = () => {},
}) {
  const { t } = useTranslation();
  const [selectedColumn, setSelectedColumn] = useState(initialColumn);
  const [selectedColumns, setSelectedColumns] = useState(initialColumns);
  const [selectedExpId, setSelectedExpId] = useState(initialExpectation?.expId || '');
  const [threshold, setThreshold] = useState(String(initialExpectation?.threshold ?? 100));
  const [draft, setDraft] = useState(() =>
    initialExpectation ? draftFromExpectation(initialExpectation) : EMPTY_DRAFT,
  );
  // Etapa 6.2: escape hatch — nunca una restricción dura (doc's propia
  // sección "Escape hatch"). Se resetea al cambiar de tab/columna (más
  // abajo), no persiste entre columnas distintas.
  const [showAllExpectations, setShowAllExpectations] = useState(false);

  const catalog = catalogFor(activeTab);
  const currentEntry = catalog.find((entry) => entry.expId === selectedExpId) || null;
  const selectedColumnType =
    columns.find((column) => column.name === selectedColumn)?.tipoDato || 'sin_definir';
  // El catálogo visible en el dropdown "Tipo de expectativa" — sólo se
  // filtra en la pestaña Columna, y sólo si hay un tipo real definido y el
  // escape hatch no está activo.
  const allowedIds = activeTab === 'column' && !showAllExpectations ? allowedColumnExpIds(selectedColumnType) : null;
  const visibleColumnExpectations = allowedIds
    ? COLUMN_EXPECTATIONS.filter((entry) => allowedIds.has(entry.expId))
    : COLUMN_EXPECTATIONS;

  // Etapa 6.2, "Extensión a Multicolumna" (opcional): una vez elegida la
  // primera columna, las de tipo incompatible se des-priorizan (van al
  // final, con un hint) — nunca se ocultan, siguen siendo elegibles.
  const firstSelectedType =
    selectedColumns.length > 0
      ? columns.find((column) => column.name === selectedColumns[0])?.tipoDato || 'sin_definir'
      : 'sin_definir';
  const deprioritizedColumns = new Set(
    firstSelectedType === 'sin_definir'
      ? []
      : columns
          .filter(
            (column) =>
              !selectedColumns.includes(column.name) &&
              column.tipoDato !== 'sin_definir' &&
              column.tipoDato !== firstSelectedType,
          )
          .map((column) => column.name),
  );
  const orderedMulticolumnColumns = [...columns].sort((a, b) => {
    const aDown = deprioritizedColumns.has(a.name);
    const bDown = deprioritizedColumns.has(b.name);
    if (aDown === bDown) return 0;
    return aDown ? 1 : -1;
  });

  function switchTab(tab) {
    onTabChange(tab);
    setSelectedExpId('');
    setSelectedColumns([]);
    setDraft(EMPTY_DRAFT);
    setThreshold('100');
    setShowAllExpectations(false);
  }

  // Cambiar de columna puede dejar el tipo de expectativa elegido fuera del
  // catálogo filtrado por el nuevo tipo de dato — se resetea, mismo
  // criterio que cambiar de tab.
  function handleColumnSelect(column) {
    setSelectedColumn(column);
    setSelectedExpId('');
    setDraft(EMPTY_DRAFT);
    setShowAllExpectations(false);
  }

  function handleExpIdChange(expId) {
    // Cambiar de tipo sin haber agregado el anterior reemplaza los inputs,
    // no los acumula (etapa-6, tests requeridos) — pero para ciertas
    // expectativas de Tabla, "vacío" ahora es en realidad "precargado con
    // el valor real del archivo de referencia" (prefillDraftFor, etapa-6.1).
    setSelectedExpId(expId);
    setDraft(prefillDraftFor(activeTab, expId, columns, rowCount, selectedColumnType));
  }

  function toggleMulticolumnSelection(column) {
    setSelectedColumns((current) =>
      current.includes(column) ? current.filter((c) => c !== column) : [...current, column],
    );
  }

  function toggleTypeListValue(type) {
    setDraft((current) => ({
      ...current,
      typeList: current.typeList.includes(type)
        ? current.typeList.filter((t2) => t2 !== type)
        : [...current.typeList, type],
    }));
  }

  const canSubmit =
    Boolean(currentEntry) &&
    (activeTab !== 'column' || Boolean(selectedColumn)) &&
    (activeTab !== 'multicolumn' || selectedColumns.length >= 2) &&
    currentEntry.inputs.every((kind) => isInputFilled(kind, draft));

  function buildExpectation() {
    const params = buildParams(currentEntry.inputs, draft);
    const base = { expId: selectedExpId, scope: activeTab, params };
    return activeTab === 'table'
      ? base
      : activeTab === 'column'
        ? { ...base, column: selectedColumn, threshold: Number(threshold) || 100 }
        : { ...base, columns: selectedColumns, threshold: Number(threshold) || 100 };
  }

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit(buildExpectation());
    if (!isEditing) {
      // Modo alta: limpia el tipo/draft pero deja tab+columna como están —
      // agregar varias reglas seguidas para la misma columna no obliga a
      // re-elegirla cada vez. En modo edición el padre va a remontar este
      // panel entero después de onSubmit, así que no hace falta resetear
      // nada acá.
      setSelectedExpId('');
      setDraft(EMPTY_DRAFT);
      setThreshold('100');
    }
  }

  // Previsualización en lenguaje natural (etapa-6.1 §4): arma una
  // expectativa "parcial" con lo que ya está completado en el draft — los
  // valores que faltan quedan `undefined` en `params` (buildParams ya se
  // encarga, ver arriba) y formatExpectationText los muestra como "___".
  const previewParams = currentEntry ? buildParams(currentEntry.inputs, draft) : {};
  const previewText = selectedExpId
    ? formatExpectationText(
        {
          expId: selectedExpId,
          scope: activeTab,
          column: selectedColumn,
          columns: selectedColumns,
          params: previewParams,
          threshold: Number(threshold) || 100,
        },
        t,
      )
    : '';
  // Nivel Columna: el catálogo (etapa-0 §6) no incluye el nombre de columna
  // en su propia plantilla (EXP-DT-012 es "Entre 18 y 65", no "Edad: Entre
  // 18 y 65") — sin este prefijo la preview leería igual sin importar qué
  // columna está seleccionada. Multicolumna no lo necesita: sus plantillas
  // (032-035) ya interpolan `columns` directamente.
  const previewLine =
    activeTab === 'column' && previewText
      ? `${selectedColumn || '___'}: ${previewText}`
      : previewText;

  const isConfiguringColumn = activeTab === 'column' && Boolean(selectedColumn);

  return (
    <div
      className={[styles.wrapper, isConfiguringColumn && styles.wrapperConfiguring]
        .filter(Boolean)
        .join(' ')}
    >
      {isConfiguringColumn && (
        <p className={styles.configuringHeader}>
          {t('dataTesting.configuringColumn', { column: selectedColumn })}
        </p>
      )}

      <div className={styles.tabs} role="tablist">
        {['table', 'column', 'multicolumn'].map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={[styles.tab, activeTab === tab && styles.tabActive].filter(Boolean).join(' ')}
            onClick={() => switchTab(tab)}
          >
            {t(`dataTesting.expectationSelector.tab${tab === 'table' ? 'Table' : tab === 'column' ? 'Column' : 'Multicolumn'}`)}
          </button>
        ))}
      </div>

      <div className={styles.builder}>
        {activeTab === 'column' && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="expectation-column">
              {t('dataTesting.expectationSelector.selectColumn')}
            </label>
            <select
              id="expectation-column"
              className={styles.select}
              value={selectedColumn}
              onChange={(event) => handleColumnSelect(event.target.value)}
            >
              <option value="">{t('dataTesting.expectationSelector.chooseType')}</option>
              {columns.map((column) => (
                <option key={column.name} value={column.name}>
                  {column.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {activeTab === 'column' && selectedColumn && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="expectation-column-type">
              {t('dataTesting.expectationSelector.columnTypeLabel')}
            </label>
            <select
              id="expectation-column-type"
              className={styles.select}
              value={selectedColumnType}
              onChange={(event) => onColumnTypeChange(selectedColumn, event.target.value)}
            >
              <option value="sin_definir">
                {t('dataTesting.expectationSelector.columnTypeSinDefinir')}
              </option>
              <option value="numero">{t('dataTesting.expectationSelector.columnTypeNumero')}</option>
              <option value="texto">{t('dataTesting.expectationSelector.columnTypeTexto')}</option>
              <option value="fecha">{t('dataTesting.expectationSelector.columnTypeFecha')}</option>
            </select>
          </div>
        )}

        {activeTab === 'multicolumn' && (
          <div className={styles.field}>
            <span className={styles.label}>{t('dataTesting.expectationSelector.selectColumns')}</span>
            <div className={styles.checkboxList}>
              {orderedMulticolumnColumns.map((column) => (
                <label
                  key={column.name}
                  className={[styles.checkboxItem, deprioritizedColumns.has(column.name) && styles.checkboxDeprioritized]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <input
                    type="checkbox"
                    checked={selectedColumns.includes(column.name)}
                    onChange={() => toggleMulticolumnSelection(column.name)}
                  />
                  {column.name}
                  {deprioritizedColumns.has(column.name) && (
                    <span className={styles.order}>
                      ({t('dataTesting.expectationSelector.differentTypeHint')})
                    </span>
                  )}
                  {selectedColumns.includes(column.name) && (
                    <span className={styles.order}>#{selectedColumns.indexOf(column.name) + 1}</span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label} htmlFor="expectation-type">
            {t('dataTesting.expectationSelector.selectType')}
          </label>
          <select
            id="expectation-type"
            className={styles.select}
            value={selectedExpId}
            onChange={(event) => handleExpIdChange(event.target.value)}
          >
            <option value="">{t('dataTesting.expectationSelector.chooseType')}</option>
            {activeTab === 'column'
              ? GROUP_ORDER.map((group) => {
                  const entriesInGroup = visibleColumnExpectations.filter(
                    (entry) => entry.group === group,
                  );
                  if (entriesInGroup.length === 0) return null;
                  return (
                    <optgroup
                      key={group}
                      label={t(
                        `dataTesting.expectationSelector.group${group.charAt(0).toUpperCase()}${group.slice(1)}`,
                      )}
                    >
                      {entriesInGroup.map((entry) => (
                        <option key={entry.expId} value={entry.expId}>
                          {t(`dataTesting.expectations.${entry.expId}`)}
                        </option>
                      ))}
                    </optgroup>
                  );
                })
              : catalog.map((entry) => (
                  <option key={entry.expId} value={entry.expId}>
                    {t(`dataTesting.expectations.${entry.expId}`)}
                  </option>
                ))}
          </select>
        </div>

        {activeTab === 'column' && selectedColumnType !== 'sin_definir' && (
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => setShowAllExpectations((current) => !current)}
          >
            {showAllExpectations
              ? t('dataTesting.expectationSelector.hideAllExpectations')
              : t('dataTesting.expectationSelector.showAllExpectations')}
          </button>
        )}

        {currentEntry?.inputs.includes('count') && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="expectation-count">
              {t('dataTesting.expectationSelector.count')}
            </label>
            <input
              id="expectation-count"
              type="number"
              className={styles.input}
              value={draft.count}
              onChange={(event) => setDraft({ ...draft, count: event.target.value })}
            />
          </div>
        )}

        {currentEntry?.inputs.includes('min') && (
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="expectation-min">
                {t('dataTesting.expectationSelector.min')}
              </label>
              <input
                id="expectation-min"
                type="number"
                className={styles.input}
                value={draft.min}
                onChange={(event) => setDraft({ ...draft, min: event.target.value })}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="expectation-max">
                {t('dataTesting.expectationSelector.max')}
              </label>
              <input
                id="expectation-max"
                type="number"
                className={styles.input}
                value={draft.max}
                onChange={(event) => setDraft({ ...draft, max: event.target.value })}
              />
            </div>
          </div>
        )}

        {currentEntry?.inputs.includes('length') && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="expectation-length">
              {t('dataTesting.expectationSelector.length')}
            </label>
            <input
              id="expectation-length"
              type="number"
              className={styles.input}
              value={draft.length}
              onChange={(event) => setDraft({ ...draft, length: event.target.value })}
            />
          </div>
        )}

        {currentEntry?.inputs.includes('target') && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="expectation-target">
              {t('dataTesting.expectationSelector.target')}
            </label>
            <input
              id="expectation-target"
              type="number"
              className={styles.input}
              value={draft.target}
              onChange={(event) => setDraft({ ...draft, target: event.target.value })}
            />
          </div>
        )}

        {currentEntry?.inputs.includes('values') && (
          <TagInput
            label={t('dataTesting.expectationSelector.values')}
            value={draft.values}
            onChange={(values) => setDraft({ ...draft, values })}
          />
        )}

        {currentEntry?.inputs.includes('columnList') && (
          <TagInput
            label={t('dataTesting.expectationSelector.columnList')}
            value={draft.columnList}
            onChange={(columnList) => setDraft({ ...draft, columnList })}
          />
        )}

        {/* Sólo se pregunta acá si la columna no tiene un tipo ya declarado
            arriba ("Tipo de dato de esta columna") — con un tipo conocido,
            prefillDraftFor ya precargó `draft.dataType` con el valor
            correcto (columnTipoDatoToExpectationDataType) y mostrar este
            segundo selector es una pregunta duplicada (reporte directo del
            usuario tras ver "Número" repetido dos veces en la pantalla). */}
        {currentEntry?.inputs.includes('dataType') && selectedColumnType === 'sin_definir' && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="expectation-data-type">
              {t('dataTesting.expectationSelector.dataType')}
            </label>
            <select
              id="expectation-data-type"
              className={styles.select}
              value={draft.dataType}
              onChange={(event) => setDraft({ ...draft, dataType: event.target.value })}
            >
              {DATA_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`dataTesting.expectationSelector.type${type.charAt(0).toUpperCase()}${type.slice(1)}`)}
                </option>
              ))}
            </select>
          </div>
        )}

        {currentEntry?.inputs.includes('typeList') && (
          <div className={styles.field}>
            <span className={styles.label}>{t('dataTesting.expectationSelector.typeList')}</span>
            <div className={styles.checkboxList}>
              {DATA_TYPES.map((type) => (
                <label key={type} className={styles.checkboxItem}>
                  <input
                    type="checkbox"
                    checked={draft.typeList.includes(type)}
                    onChange={() => toggleTypeListValue(type)}
                  />
                  {t(`dataTesting.expectationSelector.type${type.charAt(0).toUpperCase()}${type.slice(1)}`)}
                </label>
              ))}
            </div>
          </div>
        )}

        {currentEntry?.inputs.includes('pattern') && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="expectation-pattern">
              {t('dataTesting.expectationSelector.pattern')}
            </label>
            <input
              id="expectation-pattern"
              type="text"
              className={styles.input}
              value={draft.pattern}
              onChange={(event) => setDraft({ ...draft, pattern: event.target.value })}
            />
          </div>
        )}

        {currentEntry?.inputs.includes('patternList') && (
          <TagInput
            label={t('dataTesting.expectationSelector.patternList')}
            value={draft.patternList}
            onChange={(patternList) => setDraft({ ...draft, patternList })}
          />
        )}

        {currentEntry?.inputs.includes('orEqual') && (
          <label className={styles.checkboxItem}>
            <input
              type="checkbox"
              checked={draft.orEqual}
              onChange={(event) => setDraft({ ...draft, orEqual: event.target.checked })}
            />
            {t('dataTesting.expectationSelector.orEqual')}
          </label>
        )}

        {currentEntry && activeTab !== 'table' && (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="expectation-threshold">
              {t('dataTesting.expectationSelector.threshold')}
            </label>
            <input
              id="expectation-threshold"
              type="number"
              min="0"
              max="100"
              className={styles.input}
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
            />
          </div>
        )}

        {selectedExpId && (
          <p className={styles.preview}>
            ✔ {t('dataTesting.previewPrefix')} {previewLine}.
          </p>
        )}

        <div className={styles.submitRow}>
          <Button type="button" size="sm" disabled={!canSubmit} onClick={handleSubmit}>
            {isEditing
              ? t('dataTesting.saveChangesButton')
              : t('dataTesting.expectationSelector.addButton')}
          </Button>
          {isEditing && (
            <Button type="button" variant="secondary" size="sm" onClick={onCancelEdit}>
              {t('common.cancel')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
