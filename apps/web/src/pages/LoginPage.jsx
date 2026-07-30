import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { Card } from '../components/Card';
import { TextField } from '../components/TextField';
import { Button } from '../components/Button';
import { LANGUAGE_FLAGS } from '../i18n/languageFlags';
import styles from './LoginPage.module.css';

// The shell's Topbar (theme/language toggles) only renders once
// authenticated — this page needs its own, so switching works on the whole
// app, not just once you're past the login screen.
export function LoginPage() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to={location.state?.from?.pathname || '/projects'} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate(location.state?.from?.pathname || '/projects', { replace: true });
    } catch {
      setError(t('auth.loginError'));
    } finally {
      setIsSubmitting(false);
    }
  }

  function toggleLanguage() {
    i18n.changeLanguage(i18n.language === 'es' ? 'en' : 'es');
  }

  return (
    <div className={styles.page}>
      <div className={styles.toggleBar}>
        <Button variant="secondary" onClick={toggleLanguage} title={t('language.toggle')}>
          {LANGUAGE_FLAGS[i18n.language === 'es' ? 'en' : 'es']}
        </Button>
        <Button variant="secondary" onClick={toggleTheme} title={t('theme.toggle')}>
          {theme === 'light' ? t('theme.dark') : t('theme.light')}
        </Button>
      </div>
      <Card className={styles.card}>
        <h1 className={styles.title}>{t('common.appName')}</h1>
        <h2 className={styles.subtitle}>{t('auth.loginTitle')}</h2>
        <form onSubmit={handleSubmit}>
          <TextField
            label={t('auth.email')}
            type="email"
            value={email}
            onChange={setEmail}
            required
          />
          <TextField
            label={t('auth.password')}
            type="password"
            value={password}
            onChange={setPassword}
            required
          />
          {error && <p className={styles.error}>{error}</p>}
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {t('auth.loginButton')}
          </Button>
        </form>
      </Card>
    </div>
  );
}
