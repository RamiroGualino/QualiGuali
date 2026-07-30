import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import styles from './Pagination.module.css';

const PAGE_SIZE_OPTIONS = [10, 25, 50];

// Purely client-side: every list endpoint in this app returns the full
// collection (none support skip/limit yet), so pagination just slices an
// already-fetched array — no new backend query params needed.
export function Pagination({
  page = 1,
  pageSize = 25,
  totalItems = 0,
  onPageChange = () => {},
  onPageSizeChange = () => {},
}) {
  const { t } = useTranslation();
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  return (
    <div className={styles.wrapper}>
      <label className={styles.pageSize}>
        {t('common.itemsPerPage')}
        <select
          className={styles.select}
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.nav}>
        <Button variant="secondary" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          {'<'}
        </Button>
        <span className={styles.pageLabel}>{t('common.pageOf', { page, totalPages })}</span>
        <Button
          variant="secondary"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          {'>'}
        </Button>
      </div>
    </div>
  );
}
