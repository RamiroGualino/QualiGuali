import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Select } from '../components/Select';
import { Tabs } from '../components/Tabs';
import { UsersPage } from './UsersPage';
import styles from './SettingsPage.module.css';

function activeTabFor(pathname) {
  return pathname.endsWith('/users') ? 'users' : 'general';
}

// Language/theme (General) plus, now, user administration — moved here from
// Project Management since it isn't really a per-project concern. Same
// URL-driven tab pattern as ProjectManagementPage: registered at 2 routes
// in router.jsx, active tab derived from the URL.
export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const activeTab = activeTabFor(location.pathname);

  const tabs = [
    { key: 'general', label: t('settings.generalTab'), to: '/settings', end: true },
    { key: 'users', label: t('nav.users'), to: '/settings/users', end: true },
  ];

  return (
    <div>
      <PageHeader title={t('settings.title')} />
      <Tabs items={tabs} />
      {activeTab === 'general' && (
        <Card>
          <div className={styles.row}>
            <Select
              label={t('settings.languageLabel')}
              value={i18n.language}
              onChange={(value) => i18n.changeLanguage(value)}
              options={[
                { value: 'es', label: t('language.es') },
                { value: 'en', label: t('language.en') },
              ]}
            />
          </div>
          <div className={styles.row}>
            <Select
              label={t('settings.themeLabel')}
              value={theme}
              onChange={(value) => setTheme(value)}
              options={[
                { value: 'light', label: t('theme.light') },
                { value: 'dark', label: t('theme.dark') },
              ]}
            />
          </div>
        </Card>
      )}
      {activeTab === 'users' && <UsersPage />}
    </div>
  );
}
