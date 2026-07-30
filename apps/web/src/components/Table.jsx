import styles from './Table.module.css';

// columns: [{ key, header, render?(row) }]. No required props — an empty
// table just renders headers with no rows. onRowClick is opt-in — rows only
// become clickable (and get a pointer cursor) when a handler is passed.
export function Table({
  columns = [],
  rows = [],
  getRowKey = (row, i) => row.id ?? row._id ?? i,
  onRowClick,
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
              className={onRowClick ? styles.clickableRow : undefined}
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
