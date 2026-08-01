import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { postmanSuitesApi } from '../api/execution.api';
import { requirementsApi } from '../api/qaCore.api';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmModal } from '../components/ConfirmModal';
import { TextField } from '../components/TextField';
import { Select } from '../components/Select';
import { Combobox } from '../components/Combobox';
import { Table } from '../components/Table';
import { Tabs } from '../components/Tabs';
import { Dropzone } from '../components/Dropzone';
import { StatusBadge } from '../components/StatusBadge';
import { Spinner } from '../components/Spinner';
import { RowActionsMenu } from '../components/RowActionsMenu';
import { Badge } from '../components/Badge';
import { LoadingState, ErrorState, EmptyState } from '../components/QueryStates';
import styles from './PostmanSuitesPage.module.css';

const ALL_REQUIREMENTS = '';

// How long a "just finished" pass/fail result stays visible next to a
// Suite's Run button before reverting to the plain button — long enough to
// register at a glance, short enough not to look stuck (Jenkins-style: the
// job ball briefly shows its fresh result, then settles back to idle).
const FINISHED_RESULT_DISPLAY_MS = 6000;

// Postman Runner module (docs/postman-runner/, Etapas 2-3): manages
// PostmanSuite definitions (a collection + optional environment, versioned)
// and triggers live Newman runs against them. A separate page from
// AutomationPage — a Suite is something you *manage over time* (create,
// version, schedule), not a report you upload once — but shares the same
// tab bar so it reads as one "Automation" area, not a disconnected screen.
// A triggered run's actual results land in AutomationPage's API tab once
// Newman finishes (fire-and-forget on the backend, see
// postmanRunner.controller.js) — this page doesn't show results itself.
function tabItems(t, projectId) {
  return [
    { key: 'ui', label: t('automation.uiTab'), to: `/projects/${projectId}/automation`, end: true },
    {
      key: 'api',
      label: t('automation.apiTab'),
      to: `/projects/${projectId}/automation/api`,
      end: true,
    },
    {
      key: 'suites',
      label: t('automation.suitesTab'),
      to: `/projects/${projectId}/automation/suites`,
      end: true,
    },
  ];
}

export function PostmanSuitesPage() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const queryClient = useQueryClient();
  // URL-driven (not just local state), same convention TestSuitesPage's own
  // Requirement filter uses — lets another screen deep-link straight here
  // pre-filtered to a given requirement.
  const [searchParams, setSearchParams] = useSearchParams();
  const requirementFilter = searchParams.get('requirementId') || ALL_REQUIREMENTS;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [createRequirementId, setCreateRequirementId] = useState('');
  // What's typed/picked in the requirement Combobox — kept separate from
  // createRequirementId since a native datalist only round-trips visible
  // text, not the requirement's own id (see TestSuitesPage's own comment).
  const [requirementSearch, setRequirementSearch] = useState('');
  const [collectionFile, setCollectionFile] = useState(null);
  const [environmentFile, setEnvironmentFile] = useState(null);
  const [createError, setCreateError] = useState('');

  const [versionSuite, setVersionSuite] = useState(null);
  const [versionCollectionFile, setVersionCollectionFile] = useState(null);
  const [versionEnvironmentFile, setVersionEnvironmentFile] = useState(null);
  const [versionError, setVersionError] = useState('');

  const [deletingSuite, setDeletingSuite] = useState(null);

  const [feedback, setFeedback] = useState('');
  // { [suiteId]: 'passed' | 'failed' } — set the moment a Suite's isRunning
  // flips from true to false (see the effect below), cleared automatically
  // after FINISHED_RESULT_DISPLAY_MS.
  const [justFinished, setJustFinished] = useState({});
  const wasRunningRef = useRef({});

  const requirementsQuery = useQuery({
    queryKey: ['requirements', projectId],
    queryFn: () => requirementsApi.list(projectId),
  });
  const requirements = requirementsQuery.data?.requirements || [];
  const requirementById = Object.fromEntries(requirements.map((req) => [req._id, req]));

  const suitesQuery = useQuery({
    queryKey: ['postmanSuites', projectId, requirementFilter],
    queryFn: () =>
      postmanSuitesApi.list({ projectId, requirementId: requirementFilter || undefined }),
    // Jenkins-style live "is it running right now" — polls quickly only
    // while at least one Suite actually is (any trigger source: this
    // page's own Run button, a cron schedule, a retry), and stops
    // polling entirely the moment nothing is in flight, per query's own
    // freshly-fetched data rather than a value captured at query-creation
    // time (see @tanstack/react-query's function form of refetchInterval).
    refetchInterval: (query) => {
      const anyRunning = query.state.data?.postmanSuites?.some((suite) => suite.isRunning);
      return anyRunning ? 1500 : false;
    },
  });
  const suites = useMemo(() => suitesQuery.data?.postmanSuites || [], [suitesQuery.data]);

  function setRequirementFilter(requirementId) {
    setSearchParams(requirementId ? { requirementId } : {});
  }

  function handleRequirementSearchChange(text) {
    setRequirementSearch(text);
    const matched = requirements.find((req) => req.title === text);
    setCreateRequirementId(matched ? matched._id : '');
  }

  // Detects each Suite's running -> not-running transition and, right when
  // it happens, re-fetches that Suite to show a brief pass/fail result
  // instead of just silently going back to the plain Run button.
  //
  // This reflects whether the Suite itself EXECUTED (lastRunStatus is
  // 'completed', vs. e.g. 'timeout'/'download_error'/'execution_error' —
  // see PostmanSuite's own schema comment), never whether the run's
  // individual tests passed or failed — a completed run with failing
  // assertions is still 'completed' here. Per-test results belong in the
  // report (AutomationPage's API tab / the run detail page), not in this
  // row's Actions column.
  useEffect(() => {
    suites.forEach((suite) => {
      const wasRunning = wasRunningRef.current[suite._id];
      wasRunningRef.current[suite._id] = suite.isRunning;
      if (!wasRunning || suite.isRunning) return;

      postmanSuitesApi.get(suite._id).then((res) => {
        const lastRunStatus = res.postmanSuite?.lastRunStatus;
        if (!lastRunStatus) return;
        const result = lastRunStatus === 'completed' ? 'passed' : 'failed';
        setJustFinished((prev) => ({ ...prev, [suite._id]: result }));
        setTimeout(() => {
          setJustFinished((prev) => {
            const { [suite._id]: _removed, ...rest } = prev;
            return rest;
          });
        }, FINISHED_RESULT_DISPLAY_MS);
      });
    });
  }, [suites]);

  function resetCreateForm() {
    setName('');
    setDescription('');
    setCreateRequirementId('');
    setRequirementSearch('');
    setCollectionFile(null);
    setEnvironmentFile(null);
    setCreateError('');
  }

  const createMutation = useMutation({
    mutationFn: () =>
      postmanSuitesApi.create({
        projectId,
        requirementId: createRequirementId,
        name,
        description,
        collectionFile,
        environmentFile,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['postmanSuites', projectId] });
      setIsCreateOpen(false);
      resetCreateForm();
    },
    onError: (error) => setCreateError(error.message),
  });

  const removeMutation = useMutation({
    mutationFn: () => postmanSuitesApi.remove(deletingSuite._id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['postmanSuites', projectId] });
      setDeletingSuite(null);
    },
    onError: (error) => {
      setFeedback(error.message);
      setDeletingSuite(null);
    },
  });

  const versionMutation = useMutation({
    mutationFn: () =>
      postmanSuitesApi.addVersion(versionSuite._id, {
        collectionFile: versionCollectionFile,
        environmentFile: versionEnvironmentFile,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['postmanSuites', projectId] });
      setVersionSuite(null);
      setVersionCollectionFile(null);
      setVersionEnvironmentFile(null);
      setVersionError('');
    },
    onError: (error) => setVersionError(error.message),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (suite) => postmanSuitesApi.update(suite._id, { isActive: !suite.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['postmanSuites', projectId] }),
  });

  const runMutation = useMutation({
    mutationFn: (suite) => postmanSuitesApi.run(suite._id),
    onSuccess: () => {
      // Newman claims the concurrency guard synchronously, before the 202
      // response is even sent (see postmanRunner.service.js) — by the time
      // this resolves, isRunning is already true on the backend, so an
      // immediate refetch (rather than waiting for the next poll tick)
      // flips this row to its spinner state without a visible delay.
      queryClient.invalidateQueries({ queryKey: ['postmanSuites', projectId] });
      queryClient.invalidateQueries({ queryKey: ['automationRuns', projectId] });
    },
    onError: (error) => setFeedback(error.message),
  });

  return (
    <div>
      <PageHeader
        title={t('automation.title')}
        action={
          <Button icon="+" onClick={() => setIsCreateOpen(true)}>
            {t('postmanSuites.createButton')}
          </Button>
        }
      />

      <Tabs items={tabItems(t, projectId)} />

      {feedback && (
        <Card className={styles.feedback}>
          <div className={styles.feedbackRow}>
            <span>{feedback}</span>
            <Button variant="secondary" size="sm" onClick={() => setFeedback('')}>
              {t('common.close')}
            </Button>
          </div>
        </Card>
      )}

      <Card>
        {suitesQuery.isLoading && <LoadingState />}
        {suitesQuery.isError && <ErrorState onRetry={suitesQuery.refetch} />}
        {!suitesQuery.isLoading && !suitesQuery.isError && (
          <div className={styles.filters}>
            <Select
              label={t('requirements.title')}
              value={requirementFilter}
              onChange={setRequirementFilter}
              options={[
                { value: ALL_REQUIREMENTS, label: t('common.all') },
                ...requirements.map((req) => ({ value: req._id, label: req.title })),
              ]}
            />
          </div>
        )}
        {!suitesQuery.isLoading && !suitesQuery.isError && suites.length === 0 && (
          <EmptyState message={t('postmanSuites.emptyState')} />
        )}
        {!suitesQuery.isLoading && !suitesQuery.isError && suites.length > 0 && (
          <Table
            columns={[
              { key: 'name', header: t('common.name') },
              {
                key: 'requirementId',
                header: t('requirements.title'),
                render: (row) => {
                  const requirement = requirementById[row.requirementId];
                  return requirement ? <Badge tone="info">{requirement.code}</Badge> : '—';
                },
              },
              {
                key: 'collectionVersion',
                header: t('postmanSuites.collectionVersion'),
                render: (row) => `v${row.collectionVersion}`,
              },
              {
                key: 'environment',
                header: t('postmanSuites.environment'),
                render: (row) =>
                  row.environmentFileUrl ? `v${row.environmentVersion}` : t('common.none'),
              },
              {
                key: 'isActive',
                header: t('common.status'),
                render: (row) => (
                  <StatusBadge
                    status={row.isActive ? 'active' : 'inactive'}
                    label={row.isActive ? t('postmanSuites.active') : t('postmanSuites.inactive')}
                  />
                ),
              },
              {
                key: 'actions',
                header: t('common.actions'),
                render: (row) => (
                  <div className={styles.actions}>
                    {row.isRunning ? (
                      <span className={styles.runIndicator}>
                        <Spinner size={0.9} />
                        {t('postmanSuites.running')}
                      </span>
                    ) : justFinished[row._id] ? (
                      <span
                        className={[
                          styles.runIndicator,
                          justFinished[row._id] === 'passed'
                            ? styles.resultPassed
                            : styles.resultFailed,
                        ].join(' ')}
                      >
                        {justFinished[row._id] === 'passed' ? '✓' : '✕'}{' '}
                        {t(
                          justFinished[row._id] === 'passed'
                            ? 'automation.statusPillPassed'
                            : 'automation.statusPillFailed',
                        )}
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        disabled={!row.isActive || runMutation.isPending}
                        onClick={() => runMutation.mutate(row)}
                      >
                        {t('postmanSuites.run')}
                      </Button>
                    )}
                    <RowActionsMenu
                      actions={[
                        { label: t('postmanSuites.addVersion'), onClick: () => setVersionSuite(row) },
                        {
                          label: row.isActive
                            ? t('postmanSuites.deactivate')
                            : t('postmanSuites.reactivate'),
                          onClick: () => toggleActiveMutation.mutate(row),
                        },
                        {
                          label: t('common.delete'),
                          danger: true,
                          onClick: () => setDeletingSuite(row),
                        },
                      ]}
                    />
                  </div>
                ),
              },
            ]}
            rows={suites}
          />
        )}
      </Card>

      <Modal
        open={isCreateOpen}
        title={t('postmanSuites.createTitle')}
        onClose={() => {
          setIsCreateOpen(false);
          resetCreateForm();
        }}
      >
        <Combobox
          label={t('requirements.title')}
          value={requirementSearch}
          onChange={handleRequirementSearchChange}
          required
          placeholder={t('postmanSuites.selectRequirement')}
          options={requirements.map((req) => ({ value: req._id, label: req.title }))}
        />
        <TextField label={t('common.name')} value={name} onChange={setName} />
        <TextField
          label={t('common.description')}
          value={description}
          onChange={setDescription}
          as="textarea"
        />
        <p className={styles.fieldLabel}>{t('postmanSuites.collectionFile')}</p>
        <Dropzone
          compact
          accept="application/json"
          hint={collectionFile ? collectionFile.name : t('postmanSuites.collectionDropHint')}
          onFiles={(files) => setCollectionFile(files[0])}
        />
        <p className={styles.fieldLabel}>{t('postmanSuites.environmentFile')}</p>
        <Dropzone
          compact
          accept="application/json"
          hint={environmentFile ? environmentFile.name : t('postmanSuites.environmentDropHint')}
          onFiles={(files) => setEnvironmentFile(files[0])}
        />
        {createError && <p className={styles.error}>{createError}</p>}
        <Button
          disabled={!createRequirementId || !name || !collectionFile || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          {t('common.create')}
        </Button>
      </Modal>

      <Modal
        open={Boolean(versionSuite)}
        title={t('postmanSuites.addVersionTitle')}
        onClose={() => {
          setVersionSuite(null);
          setVersionError('');
        }}
      >
        <p className={styles.fieldLabel}>{t('postmanSuites.collectionFile')}</p>
        <Dropzone
          compact
          accept="application/json"
          hint={
            versionCollectionFile
              ? versionCollectionFile.name
              : t('postmanSuites.collectionDropHint')
          }
          onFiles={(files) => setVersionCollectionFile(files[0])}
        />
        <p className={styles.fieldLabel}>{t('postmanSuites.environmentFileOptionalReplace')}</p>
        <Dropzone
          compact
          accept="application/json"
          hint={
            versionEnvironmentFile
              ? versionEnvironmentFile.name
              : t('postmanSuites.environmentDropHint')
          }
          onFiles={(files) => setVersionEnvironmentFile(files[0])}
        />
        {versionError && <p className={styles.error}>{versionError}</p>}
        <Button
          disabled={!versionCollectionFile || versionMutation.isPending}
          onClick={() => versionMutation.mutate()}
        >
          {t('common.save')}
        </Button>
      </Modal>

      <ConfirmModal
        open={Boolean(deletingSuite)}
        title={t('common.delete')}
        message={t('postmanSuites.confirmDelete')}
        onCancel={() => setDeletingSuite(null)}
        onConfirm={() => removeMutation.mutate()}
        isConfirming={removeMutation.isPending}
      />
    </div>
  );
}
