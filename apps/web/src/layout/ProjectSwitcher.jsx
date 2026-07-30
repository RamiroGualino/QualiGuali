import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '../api/projects.api';
import { useCurrentProjectId } from '../hooks/useCurrentProjectId';
import styles from './ProjectSwitcher.module.css';

// The single entry point for opening/switching a project — always rendered
// in the Topbar, project selected or not, so there's no separate "open
// workspace" action anywhere else (ProjectsPage's table used to have one;
// removed in favor of this). Shows the current project name (or a
// placeholder when none is selected yet) plus a dropdown caret; the native
// <select> sits transparently on top so it stays a real, accessible
// dropdown. Uses the sticky current-project id, not just the URL param, so
// it keeps showing your project while you're on unscoped screens (the
// Proyectos list, Settings) instead of resetting to the placeholder.
export function ProjectSwitcher() {
  const { t } = useTranslation();
  const projectId = useCurrentProjectId();
  const navigate = useNavigate();

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
  });
  const projects = projectsQuery.data?.projects || [];
  const currentProject = projects.find((project) => project._id === projectId);

  return (
    <label className={styles.wrapper}>
      <span
        className={[styles.name, !currentProject && styles.placeholder].filter(Boolean).join(' ')}
      >
        {currentProject?.name || t('projects.selectProjectPlaceholder')}
      </span>
      <span className={styles.caret} aria-hidden="true">
        ▾
      </span>
      <select
        className={styles.select}
        value={projectId || ''}
        onChange={(event) => navigate(`/projects/${event.target.value}/home`)}
      >
        <option value="" disabled>
          {t('projects.selectProjectPlaceholder')}
        </option>
        {projects.map((project) => (
          <option key={project._id} value={project._id}>
            {project.name}
          </option>
        ))}
      </select>
    </label>
  );
}
