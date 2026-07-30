import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/Avatar';
import { ProjectSwitcher } from './ProjectSwitcher';
import styles from './Topbar.module.css';

// Only project context and user identity live here — language, theme, and
// project creation moved to Configuración/Gestión de Proyectos respectively.
export function Topbar() {
  const { user } = useAuth();

  return (
    <header className={styles.topbar}>
      <div className={styles.context}>
        <ProjectSwitcher />
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
