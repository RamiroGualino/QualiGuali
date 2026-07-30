import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { modulesApi } from '../api/projects.api';
import { useAuth } from '../auth/AuthContext';
import { useSearchAndPaginate } from '../hooks/useSearchAndPaginate';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmModal } from '../components/ConfirmModal';
import { TextField } from '../components/TextField';
import { Table } from '../components/Table';
import { SearchBar } from '../components/SearchBar';
import { Pagination } from '../components/Pagination';
import { RowActionsMenu } from '../components/RowActionsMenu';
import { LoadingState, ErrorState, EmptyState } from '../components/QueryStates';

const MANAGER_ROLES = ['super_admin', 'admin'];
const SEARCH_FIELDS = ['name', 'description'];

export function ModulesPage() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = MANAGER_ROLES.includes(user?.role);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [order, setOrder] = useState('0');

  const [editingModule, setEditingModule] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editOrder, setEditOrder] = useState('0');

  const [deletingModule, setDeletingModule] = useState(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['modules', projectId],
    queryFn: () => modulesApi.list(projectId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      modulesApi.create(projectId, { name, description, order: Number(order) || 0 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modules', projectId] });
      setIsCreateOpen(false);
      setName('');
      setDescription('');
      setOrder('0');
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      modulesApi.update(projectId, editingModule._id, {
        name: editName,
        description: editDescription,
        order: Number(editOrder) || 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modules', projectId] });
      setEditingModule(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => modulesApi.remove(projectId, deletingModule._id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modules', projectId] });
      setDeletingModule(null);
    },
  });

  function openEdit(module) {
    setEditingModule(module);
    setEditName(module.name);
    setEditDescription(module.description || '');
    setEditOrder(String(module.order ?? 0));
  }

  const modules = data?.modules || [];
  const {
    search,
    onSearchChange,
    page,
    pageSize,
    totalItems,
    onPageChange,
    onPageSizeChange,
    pageItems,
  } = useSearchAndPaginate(modules, SEARCH_FIELDS);

  return (
    <div>
      <PageHeader
        title={t('modules.title')}
        action={
          canManage && (
            <Button onClick={() => setIsCreateOpen(true)}>{t('modules.createButton')}</Button>
          )
        }
      />

      <Card>
        {isLoading && <LoadingState />}
        {isError && <ErrorState onRetry={refetch} />}
        {!isLoading && !isError && modules.length === 0 && (
          <EmptyState message={t('modules.emptyState')} />
        )}
        {!isLoading && !isError && modules.length > 0 && (
          <>
            <SearchBar value={search} onChange={onSearchChange} />
            {pageItems.length === 0 && <EmptyState message={t('common.noResults')} />}
            {pageItems.length > 0 && (
              <Table
                columns={[
                  { key: 'order', header: t('modules.order') },
                  { key: 'name', header: t('common.name') },
                  { key: 'description', header: t('common.description') },
                  {
                    key: 'actions',
                    header: t('common.actions'),
                    render: (row) => (
                      <RowActionsMenu
                        actions={[
                          {
                            label: t('modules.view'),
                            onClick: () =>
                              navigate(`/projects/${projectId}/requirements?moduleId=${row._id}`),
                          },
                          ...(canManage
                            ? [
                                { label: t('common.edit'), onClick: () => openEdit(row) },
                                {
                                  label: t('common.delete'),
                                  danger: true,
                                  onClick: () => setDeletingModule(row),
                                },
                              ]
                            : []),
                        ]}
                      />
                    ),
                  },
                ]}
                rows={pageItems}
              />
            )}
            <Pagination
              page={page}
              pageSize={pageSize}
              totalItems={totalItems}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
            />
          </>
        )}
      </Card>

      <Modal
        open={isCreateOpen}
        title={t('modules.createTitle')}
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
          <TextField label={t('modules.order')} type="number" value={order} onChange={setOrder} />
          <Button type="submit" disabled={createMutation.isPending}>
            {t('common.create')}
          </Button>
        </form>
      </Modal>

      <Modal
        open={Boolean(editingModule)}
        title={t('modules.editTitle')}
        onClose={() => setEditingModule(null)}
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
          <TextField
            label={t('modules.order')}
            type="number"
            value={editOrder}
            onChange={setEditOrder}
          />
          <Button type="submit" disabled={updateMutation.isPending}>
            {t('common.save')}
          </Button>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deletingModule)}
        title={t('common.delete')}
        message={t('common.confirmDelete')}
        onCancel={() => setDeletingModule(null)}
        onConfirm={() => removeMutation.mutate()}
        isConfirming={removeMutation.isPending}
      />
    </div>
  );
}
