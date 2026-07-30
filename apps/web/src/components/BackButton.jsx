import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

// Browser-history-based (navigate(-1)) rather than a hardcoded parent
// route — works correctly regardless of how the user actually arrived at
// the detail screen (deep link, different filter state, etc.).
export function BackButton() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <Button variant="secondary" onClick={() => navigate(-1)} aria-label={t('common.back')}>
      ← {t('common.back')}
    </Button>
  );
}
