import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { formatExpectationText } from '../utils/expectationText';
import styles from './ExpectationList.module.css';

// Agrupa por columna (en orden de primera aparición) — sólo tiene sentido
// para `scope: 'column'`, donde puede haber varias columnas distintas a la
// vez; Tabla/Multicolumna se renderizan como una lista plana en el propio
// componente (ver abajo), no hace falta agruparlas.
function groupByColumn(items) {
  const groups = new Map();
  items.forEach((item) => {
    const column = item.expectation.column;
    if (!groups.has(column)) groups.set(column, []);
    groups.get(column).push(item);
  });
  return Array.from(groups.entries());
}

// Pedido directo del usuario tras ver la Etapa 6.1 corriendo: la lista de
// expectativas configuradas ya no muestra todo junto — filtra por la misma
// pestaña activa en el panel de alta (`scope`), así "Columna" sólo lista
// expectativas de columna (agrupadas, puede haber varias) y "Multicolumna"
// sólo las de multicolumna. El resumen de arriba (3 Tabla · ...) se queda
// global — da contexto de todo lo armado, no sólo de la pestaña actual.
export function ExpectationList({
  expectations = [],
  scope = 'table',
  editingIndex = null,
  onEdit = () => {},
  onRemove = () => {},
}) {
  const { t } = useTranslation();

  if (expectations.length === 0) {
    return <p className={styles.empty}>{t('dataTesting.noExpectationsYet')}</p>;
  }

  const tableCount = expectations.filter((e) => e.scope === 'table').length;
  const columnExpectations = expectations.filter((e) => e.scope === 'column');
  const distinctColumnCount = new Set(columnExpectations.map((e) => e.column)).size;
  const multicolumnCount = expectations.filter((e) => e.scope === 'multicolumn').length;

  const relevantItems = [];
  expectations.forEach((expectation, index) => {
    if (expectation.scope === scope) relevantItems.push({ expectation, index });
  });

  function renderItem({ expectation, index }) {
    return (
      <li
        key={index}
        role="listitem"
        className={[styles.item, editingIndex === index && styles.itemEditing]
          .filter(Boolean)
          .join(' ')}
      >
        <span className={styles.itemText}>
          {formatExpectationText(expectation, t)}
          {expectation.scope !== 'table' && expectation.threshold !== 100 && (
            <span className={styles.thresholdChip}>
              {t('dataTesting.thresholdChip', { threshold: expectation.threshold })}
            </span>
          )}
        </span>
        <span className={styles.itemActions}>
          <Button variant="secondary" size="sm" onClick={() => onEdit(index)}>
            {t('common.edit')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onRemove(index)}>
            {t('dataTesting.expectationSelector.removeButton')}
          </Button>
        </span>
      </li>
    );
  }

  const flatGroupLabel = t(
    `dataTesting.expectationSelector.${scope === 'table' ? 'tableExpectationsGroup' : 'multicolumnExpectationsGroup'}`,
  );

  return (
    <div className={styles.wrapper}>
      <p className={styles.summary}>
        <span>{t('dataTesting.summaryTable', { count: tableCount })}</span>
        {' · '}
        <span>
          {t('dataTesting.summaryColumn', {
            count: columnExpectations.length,
            columnCount: distinctColumnCount,
          })}
        </span>
        {' · '}
        <span>{t('dataTesting.summaryMulticolumn', { count: multicolumnCount })}</span>
      </p>

      {relevantItems.length === 0 && (
        <p className={styles.empty}>{t('dataTesting.noExpectationsInScope')}</p>
      )}

      {scope === 'column'
        ? groupByColumn(relevantItems).map(([column, items]) => (
            <details key={column} open className={styles.group}>
              <summary className={styles.groupHeader}>
                {column} ({items.length})
              </summary>
              <ul className={styles.itemList} role="list" aria-label={column}>
                {items.map(renderItem)}
              </ul>
            </details>
          ))
        : relevantItems.length > 0 && (
            <ul className={styles.itemList} role="list" aria-label={flatGroupLabel}>
              {relevantItems.map(renderItem)}
            </ul>
          )}
    </div>
  );
}
