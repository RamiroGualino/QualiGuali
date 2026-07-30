import { useEffect } from 'react';
import { useParams } from 'react-router-dom';

const STORAGE_KEY = 'qualiguali.lastProjectId';

// The "current project" needs to survive navigating to project-agnostic
// screens (the unscoped Proyectos list, Settings) — otherwise the Sidebar's
// project-scoped modules and the header's project switcher go blank just
// because the URL momentarily has no :projectId, even though the user
// hasn't actually left their project. Only /projects itself (which lists
// every project) is meant to be unscoped; everything reading this hook
// instead should keep reflecting the last project actually visited.
export function useCurrentProjectId() {
  const { projectId: paramProjectId } = useParams();

  useEffect(() => {
    if (paramProjectId) localStorage.setItem(STORAGE_KEY, paramProjectId);
  }, [paramProjectId]);

  return paramProjectId || localStorage.getItem(STORAGE_KEY) || '';
}
