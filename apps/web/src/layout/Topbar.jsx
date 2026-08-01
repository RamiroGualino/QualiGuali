import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/Avatar';
import { NotificationBell } from '../components/NotificationBell';
import { ProjectSwitcher } from './ProjectSwitcher';
import styles from './Topbar.module.css';

// Project context, alerts, and user identity live here — language, theme,
// and project creation moved to Configuración/Gestión de Proyectos
// respectively. NotificationBell (Etapa 7 — docs/postman-runner/) is the
// first thing to use the .actions slot below; it renders nothing itself
// when there's no current project to scope alerts to.
export function Topbar() {
  const { user } = useAuth();

  return (
    <header className={styles.topbar}>
      <div className={styles.context}>
        <ProjectSwitcher />
      </div>
      <div className={styles.actions}>
        <NotificationBell />
      </div>
      {user && (
        <span className={styles.user}>
          <Avatar name={user.name} />
          {user.name}
        </span>
      )}
    </header>
  );
}
