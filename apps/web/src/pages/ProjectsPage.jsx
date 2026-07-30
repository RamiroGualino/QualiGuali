import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../api/projects.api';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmModal } from '../components/ConfirmModal';
import { TextField } from '../components/TextField';
import { Table } from '../components/Table';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../components/QueryStates';
import styles from './ProjectsPage.module.css';

const MANAGER_ROLES = ['super_admin', 'admin'];

export function ProjectsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = MANAGER_ROLES.includes(user?.role);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const [editingProject, setEditingProject] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const [deletingProject, setDeletingProject] = useState(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: () => projectsApi.create({ name, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setIsCreateOpen(false);
      setName('');
      setDescription('');
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      projectsApi.update(editingProject._id, { name: editName, description: editDescription }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setEditingProject(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => projectsApi.remove(deletingProject._id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setDeletingProject(null);
    },
  });

  function openEdit(project) {
    setEditingProject(project);
    setEditName(project.name);
    setEditDescription(project.description || '');
  }

  const projects = data?.projects || [];

  return (
    <div>
      <PageHeader
        title={t('projects.title')}
        action={
          canManage && (
            <Button onClick={() => setIsCreateOpen(true)}>{t('projects.createButton')}</Button>
          )
        }
      />

      <Card>
        {isLoading && <LoadingState />}
        {isError && <ErrorState onRetry={refetch} />}
        {!isLoading && !isError && projects.length === 0 && (
          <EmptyState message={t('projects.emptyState')} />
        )}
        {!isLoading && !isError && projects.length > 0 && (
          <Table
            columns={[
              { key: 'name', header: t('common.name') },
              { key: 'description', header: t('common.description') },
              {
                key: 'status',
                header: t('common.status'),
                render: (row) => (
                  <StatusBadge
                    status={row.status}
                    label={t(`projects.status${row.status === 'active' ? 'Active' : 'Archived'}`)}
                  />
                ),
              },
              {
                key: 'actions',
                header: t('common.actions'),
                render: (row) =>
                  canManage ? (
                    <div className={styles.actions}>
                      <Button variant="secondary" onClick={() => openEdit(row)}>
                        {t('common.edit')}
                      </Button>
                      <Button variant="danger" onClick={() => setDeletingProject(row)}>
                        {t('common.delete')}
                      </Button>
                    </div>
                  ) : (
                    '—'
                  ),
              },
            ]}
            rows={projects}
          />
        )}
      </Card>

      <Modal
        open={isCreateOpen}
        title={t('projects.createTitle')}
        onClose={() => setIsCreateOpen(false)}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
        >
          <TextField label={t('common.name')} value={name} onChange={setName} required />
          <TextField
            label={t('common.description')}
            value={description}
            onChange={setDescription}
            as="textarea"
          />
          <Button type="submit" disabled={createMutation.isPending}>
            {t('common.create')}
          </Button>
        </form>
      </Modal>

      <Modal
        open={Boolean(editingProject)}
        title={t('projects.editTitle')}
        onClose={() => setEditingProject(null)}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            updateMutation.mutate();
          }}
        >
          <TextField label={t('common.name')} value={editName} onChange={setEditName} required />
          <TextField
            label={t('common.description')}
            value={editDescription}
            onChange={setEditDescription}
            as="textarea"
          />
          <Button type="submit" disabled={updateMutation.isPending}>
            {t('common.save')}
          </Button>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deletingProject)}
        title={t('common.delete')}
        message={t('common.confirmDelete')}
        onCancel={() => setDeletingProject(null)}
        onConfirm={() => removeMutation.mutate()}
        isConfirming={removeMutation.isPending}
      />
    </div>
  );
}
