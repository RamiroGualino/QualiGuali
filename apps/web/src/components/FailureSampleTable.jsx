import { useTranslation } from 'react-i18next';
import styles from './FailureSampleTable.module.css';

// Etapa 11, punto 8: reemplaza la lista de valores separados por coma
// (antes en una sola celda de ExpandableText) por una tabla Registro/Valor/
// Motivo. `samples` y `affectedRecords` vienen del mismo `tallyRecords`
// (engine/helpers.js) — mismo `slice(0, sampleLimit)`, mismo orden, mismo
// largo — por eso emparejarlos por índice es seguro (ver
// docs/data-testing/etapa-11-rediseno-reporte-ejecucion.md).
//
// `reason` es el nombre amigable de la regla (ya una frase completa, p.ej.
// "No debe contener valores vacíos") — no se repite el nombre de columna acá
// porque el card que contiene esta tabla ya lo muestra en su encabezado.
function formatValue(value, t) {
  if (value === null || value === undefined || value === '') {
    return t('dataTesting.emptyValuePlaceholder');
  }
  return String(value);
}

export function FailureSampleTable({ samples = [], affectedRecords = [], reason = '' }) {
  const { t } = useTranslation();

  if (samples.length === 0) {
    return <p className={styles.empty}>{t('dataTesting.noFailureDetail')}</p>;
  }

  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{t('dataTesting.recordLabel')}</th>
            <th>{t('dataTesting.failureValueHeader')}</th>
            <th>{t('dataTesting.reasonLabel')}</th>
          </tr>
        </thead>
        <tbody>
          {samples.map((value, index) => {
            const record = affectedRecords[index];
            const identifier = record?.businessId || `#${record?.rowId ?? index}`;
            const isEmpty = value === null || value === undefined || value === '';
            return (
              // No hay otro identificador estable en `samples` — el mismo
              // valor puede repetirse entre filas de la muestra.
              <tr key={index}>
                <td>{identifier}</td>
                <td className={isEmpty ? styles.emptyValue : undefined}>{formatValue(value, t)}</td>
                <td>{reason}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
