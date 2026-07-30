import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { AppShell } from './layout/AppShell';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { ProjectManagementPage } from './pages/ProjectManagementPage';
import { TestManagementPage } from './pages/TestManagementPage';
import { TestCycleManagementPage } from './pages/TestCycleManagementPage';
import { ExecutionCycleDetailPage } from './pages/ExecutionCycleDetailPage';
import { AutomationPage } from './pages/AutomationPage';
import { DefectsPage } from './pages/DefectsPage';
import { DefectDetailPage } from './pages/DefectDetailPage';
import { ReportsDashboardPage } from './pages/ReportsDashboardPage';
import { ProjectHomePage } from './pages/ProjectHomePage';
import { SettingsPage } from './pages/SettingsPage';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectManagementPage />} />
          {/* Users moved from Project Management to Configuración — kept as a
              redirect so old links/bookmarks still land somewhere useful. */}
          <Route path="/users" element={<Navigate to="/settings/users" replace />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/users" element={<SettingsPage />} />
          <Route path="/projects/:projectId/home" element={<ProjectHomePage />} />
          <Route path="/projects/:projectId/modules" element={<ProjectManagementPage />} />
          <Route path="/projects/:projectId/requirements" element={<ProjectManagementPage />} />
          <Route path="/projects/:projectId/test-suites" element={<TestManagementPage />} />
          <Route path="/projects/:projectId/test-cases" element={<TestManagementPage />} />
          <Route path="/projects/:projectId/test-case-templates" element={<TestManagementPage />} />
          <Route path="/projects/:projectId/excel-transformer" element={<TestManagementPage />} />
          <Route path="/projects/:projectId/test-plans" element={<TestCycleManagementPage />} />
          <Route
            path="/projects/:projectId/execution-cycles"
            element={<TestCycleManagementPage />}
          />
          <Route
            path="/projects/:projectId/execution-cycles/:cycleId"
            element={<ExecutionCycleDetailPage />}
          />
          <Route path="/projects/:projectId/automation" element={<AutomationPage />} />
          <Route path="/projects/:projectId/automation/api" element={<AutomationPage />} />
          <Route path="/projects/:projectId/defects" element={<DefectsPage />} />
          <Route path="/projects/:projectId/defects/:defectId" element={<DefectDetailPage />} />
          <Route path="/projects/:projectId/reports" element={<ReportsDashboardPage />} />
          <Route path="/projects/:projectId/reports/:cycleId" element={<ReportsDashboardPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/projects" replace />} />
    </Routes>
  );
}
