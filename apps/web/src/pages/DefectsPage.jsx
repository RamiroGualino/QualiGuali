import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { defectsApi } from '../api/defects.api';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { TextField } from '../components/TextField';
import { Select } from '../components/Select';
import { Table } from '../components/Table';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../components/QueryStates';

const SEVERITIES = ['low', 'medium', 'high', 'critical'];

export function DefectsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [jiraUrl, setJiraUrl] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['defects', projectId],
    queryFn: () => defectsApi.list({ projectId }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      defectsApi.create({ projectId, title, description, severity, jiraUrl: jiraUrl || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['defects', projectId] });
      setIsCreateOpen(false);
      setTitle('');
      setDescription('');
      setSeverity('medium');
      setJiraUrl('');
    },
  });

  const defects = data?.defects || [];

  return (
    <div>
      <PageHeader
        title={t('defects.title')}
        action={<Button onClick={() => setIsCreateOpen(true)}>{t('defects.createButton')}</Button>}
      />

      <Card>
        {isLoading && <LoadingState />}
        {isError && <ErrorState onRetry={refetch} />}
        {!isLoading && !isError && defects.length === 0 && (
          <EmptyState message={t('defects.emptyState')} />
        )}
        {!isLoading && !isError && defects.length > 0 && (
          <Table
            columns={[
              { key: 'code', header: t('defects.code') },
              { key: 'title', header: t('defects.titleField') },
              {
                key: 'severity',
                header: t('defects.severity'),
                render: (row) => t(`defects.severity_${row.severity}`),
              },
              {
                key: 'status',
                header: t('common.status'),
                render: (row) => (
                  <StatusBadge status={row.status} label={t(`defects.status_${row.status}`)} />
                ),
              },
              {
                key: 'actions',
                header: t('common.actions'),
                render: (row) => (
                  <Button
                    variant="secondary"
                    onClick={() => navigate(`/projects/${projectId}/defects/${row._id}`)}
                  >
                    {t('common.edit')}
                  </Button>
                ),
              },
            ]}
            rows={defects}
          />
        )}
      </Card>

      <Modal
        open={isCreateOpen}
        title={t('defects.createTitle')}
        onClose={() => setIsCreateOpen(false)}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
        >
          <TextField label={t('defects.titleField')} value={title} onChange={setTitle} required />
          <TextField
            label={t('common.description')}
            value={description}
            onChange={setDescription}
            as="textarea"
          />
          <Select
            label={t('defects.severity')}
            value={severity}
            onChange={setSeverity}
            options={SEVERITIES.map((value) => ({ value, label: t(`defects.severity_${value}`) }))}
          />
          <TextField
            label={t('defects.jiraUrl')}
            value={jiraUrl}
            onChange={setJiraUrl}
            type="url"
            placeholder="https://your-domain.atlassian.net/browse/QG-1"
          />
          <Button type="submit" disabled={createMutation.isPending}>
            {t('common.create')}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
