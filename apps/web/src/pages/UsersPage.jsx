import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../api/users.api';
import { projectsApi } from '../api/projects.api';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmModal } from '../components/ConfirmModal';
import { TextField } from '../components/TextField';
import { Select } from '../components/Select';
import { Table } from '../components/Table';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../components/QueryStates';
import styles from './UsersPage.module.css';

const MANAGEABLE_ROLES = ['admin', 'qa_engineer'];

const EMPTY_FORM = {
  name: '',
  email: '',
  password: '',
  role: 'qa_engineer',
  assignedProjectIds: [],
};

export function UsersPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canAccess = user?.role === 'super_admin';

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);

  const [deletingUser, setDeletingUser] = useState(null);

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
    enabled: canAccess,
  });

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
    enabled: canAccess,
  });

  const createMutation = useMutation({
    mutationFn: () => usersApi.create(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsCreateOpen(false);
      setForm(EMPTY_FORM);
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      usersApi.update(editingUser._id, {
        name: editForm.name,
        role: editForm.role,
        assignedProjectIds: editForm.assignedProjectIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditingUser(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => usersApi.remove(deletingUser._id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDeletingUser(null);
    },
  });

  function openEdit(target) {
    setEditingUser(target);
    setEditForm({
      name: target.name,
      email: target.email,
      password: '',
      role: target.role,
      assignedProjectIds: target.assignedProjectIds || [],
    });
  }

  function toggleProjectId(ids, projectId) {
    return ids.includes(projectId) ? ids.filter((id) => id !== projectId) : [...ids, projectId];
  }

  if (!canAccess) {
    return (
      <div>
        <PageHeader title={t('users.title')} />
        <Card>
          <EmptyState message={t('users.forbidden')} />
        </Card>
      </div>
    );
  }

  const users = usersQuery.data?.users || [];
  const projects = projectsQuery.data?.projects || [];
  const projectNameById = Object.fromEntries(
    projects.map((project) => [project._id, project.name]),
  );

  return (
    <div>
      <PageHeader
        title={t('users.title')}
        action={<Button onClick={() => setIsCreateOpen(true)}>{t('users.createButton')}</Button>}
      />

      <Card>
        {usersQuery.isLoading && <LoadingState />}
        {usersQuery.isError && <ErrorState onRetry={usersQuery.refetch} />}
        {!usersQuery.isLoading && !usersQuery.isError && users.length === 0 && (
          <EmptyState message={t('users.emptyState')} />
        )}
        {!usersQuery.isLoading && !usersQuery.isError && users.length > 0 && (
          <Table
            columns={[
              { key: 'name', header: t('common.name') },
              { key: 'email', header: t('auth.email') },
              {
                key: 'role',
                header: t('users.role'),
                render: (row) => t(`roles.${row.role}`),
              },
              {
                key: 'assignedProjectIds',
                header: t('users.assignedProjects'),
                render: (row) =>
                  (row.assignedProjectIds || [])
                    .map((id) => projectNameById[id] || id)
                    .join(', ') || t('users.noProjects'),
              },
              {
                key: 'isActive',
                header: t('common.status'),
                render: (row) => (
                  <StatusBadge
                    status={row.isActive ? 'active' : 'archived'}
                    label={t(row.isActive ? 'users.active' : 'users.inactive')}
                  />
                ),
              },
              {
                key: 'actions',
                header: t('common.actions'),
                render: (row) =>
                  row.role === 'super_admin' ? (
                    '—'
                  ) : (
                    <div className={styles.actions}>
                      <Button variant="secondary" onClick={() => openEdit(row)}>
                        {t('common.edit')}
                      </Button>
                      <Button variant="danger" onClick={() => setDeletingUser(row)}>
                        {t('common.delete')}
                      </Button>
                    </div>
                  ),
              },
            ]}
            rows={users}
          />
        )}
      </Card>

      <Modal
        open={isCreateOpen}
        title={t('users.createTitle')}
        onClose={() => setIsCreateOpen(false)}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
        >
          <TextField
            label={t('common.name')}
            value={form.name}
            onChange={(value) => setForm((prev) => ({ ...prev, name: value }))}
            required
          />
          <TextField
            label={t('auth.email')}
            type="email"
            value={form.email}
            onChange={(value) => setForm((prev) => ({ ...prev, email: value }))}
            required
          />
          <TextField
            label={t('auth.password')}
            type="password"
            value={form.password}
            onChange={(value) => setForm((prev) => ({ ...prev, password: value }))}
            required
          />
          <Select
            label={t('users.role')}
            value={form.role}
            onChange={(value) => setForm((prev) => ({ ...prev, role: value }))}
            options={MANAGEABLE_ROLES.map((role) => ({ value: role, label: t(`roles.${role}`) }))}
          />
          <div className={styles.field}>
            <p className={styles.label}>{t('users.assignedProjects')}</p>
            <div className={styles.checklist}>
              {projects.length === 0 && <p className={styles.hint}>{t('users.noProjects')}</p>}
              {projects.map((project) => (
                <label key={project._id} className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={form.assignedProjectIds.includes(project._id)}
                    onChange={() =>
                      setForm((prev) => ({
                        ...prev,
                        assignedProjectIds: toggleProjectId(prev.assignedProjectIds, project._id),
                      }))
                    }
                  />
                  {project.name}
                </label>
              ))}
            </div>
          </div>
          <Button type="submit" disabled={createMutation.isPending}>
            {t('common.create')}
          </Button>
        </form>
      </Modal>

      <Modal
        open={Boolean(editingUser)}
        title={t('users.editTitle')}
        onClose={() => setEditingUser(null)}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            updateMutation.mutate();
          }}
        >
          <TextField
            label={t('common.name')}
            value={editForm.name}
            onChange={(value) => setEditForm((prev) => ({ ...prev, name: value }))}
            required
          />
          <TextField
            label={t('auth.email')}
            type="email"
            value={editForm.email}
            disabled
            onChange={() => {}}
          />
          <Select
            label={t('users.role')}
            value={editForm.role}
            onChange={(value) => setEditForm((prev) => ({ ...prev, role: value }))}
            options={MANAGEABLE_ROLES.map((role) => ({ value: role, label: t(`roles.${role}`) }))}
          />
          <div className={styles.field}>
            <p className={styles.label}>{t('users.assignedProjects')}</p>
            <div className={styles.checklist}>
              {projects.length === 0 && <p className={styles.hint}>{t('users.noProjects')}</p>}
              {projects.map((project) => (
                <label key={project._id} className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={editForm.assignedProjectIds.includes(project._id)}
                    onChange={() =>
                      setEditForm((prev) => ({
                        ...prev,
                        assignedProjectIds: toggleProjectId(prev.assignedProjectIds, project._id),
                      }))
                    }
                  />
                  {project.name}
                </label>
              ))}
            </div>
          </div>
          <Button type="submit" disabled={updateMutation.isPending}>
            {t('common.save')}
          </Button>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deletingUser)}
        title={t('common.delete')}
        message={t('common.confirmDelete')}
        onCancel={() => setDeletingUser(null)}
        onConfirm={() => removeMutation.mutate()}
        isConfirming={removeMutation.isPending}
      />
    </div>
  );
}
