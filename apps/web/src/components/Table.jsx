import styles from './Table.module.css';

// A tiny lookup so callers can request a row-state highlight (see
// getRowClassName below) without needing to import Table.module.css
// directly and reach into its generated class-name hashes themselves.
export function rowStateClassName(state) {
  if (state === 'failed') return styles.rowFailed;
  if (state === 'passed') return styles.rowPassed;
  return undefined;
}

// columns: [{ key, header, render?(row) }]. No required props — an empty
// table just renders headers with no rows. onRowClick is opt-in — rows only
// become clickable (and get a pointer cursor) when a handler is passed.
// getRowClassName is opt-in too — e.g. a colored left edge on a row that
// has failures, so a scan of the whole table catches problem rows before
// reading any cell text ("fail-fast" scanning). Merged with clickableRow
// rather than replacing it, so a table can be both clickable and
// state-highlighted at once.
export function Table({
  columns = [],
  rows = [],
  getRowKey = (row, i) => row.id ?? row._id ?? i,
  onRowClick,
  getRowClassName,
}) {
  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={getRowKey(row, index)}
              className={[onRowClick && styles.clickableRow, getRowClassName?.(row)]
                .filter(Boolean)
                .join(' ')}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => (
                <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
