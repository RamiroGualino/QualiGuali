import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { executionCyclesApi } from '../api/execution.api';
import { testCasesApi } from '../api/qaCore.api';
import { usersApi } from '../api/users.api';
import { codeNumber } from '../utils/executions';
import { Modal } from './Modal';
import { ExecutionDrawerContent } from './ExecutionDrawerContent';
import { LoadingState, ErrorState, EmptyState } from './QueryStates';
import styles from './CycleQuickExecutionModal.module.css';

const EMPTY_ARRAY = [];

// Same "join executions with resolved test cases, sort by case number" join
// used by ExecutionCycleDetailPage — kept in sync manually since this modal
// fetches its own copy of the same data rather than sharing state with the
// cycles list it's opened from.
function buildRows(executions, testCaseById) {
  return [...executions]
    .map((execution) => {
      const testCase = testCaseById[execution.testCaseId];
      return { ...execution, code: testCase?.code || '', title: testCase?.title || '', testCase };
    })
    .sort((a, b) => codeNumber(a.code) - codeNumber(b.code));
}

// Floating, centered "run through the whole cycle" window — opened from the
// green play button on the cycles list. Renders the exact same
// ExecutionDrawerContent used by the per-case drawer (so case info,
// evidence, history and the create-defect flow all behave identically),
// just in its `quickMode` footer: four one-tap buttons instead of a status
// picker, so a tester doesn't have to open/close a case one at a time.
export function CycleQuickExecutionModal({ projectId, cycleId, onClose }) {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(0);
  // The sticky footer's DOM node — ExecutionDrawerContent portals its four
  // quick-action buttons into it once mounted, so they read as the modal's
  // own fixed footer rather than scrolling away with the case details.
  const [footerNode, setFooterNode] = useState(null);
  const open = Boolean(cycleId);

  const cycleQuery = useQuery({
    queryKey: ['executionCycle', cycleId],
    queryFn: () => executionCyclesApi.get(cycleId),
    enabled: open,
  });

  const executionsQuery = useQuery({
    queryKey: ['executions', cycleId],
    queryFn: () => executionCyclesApi.listExecutions(cycleId),
    enabled: open,
  });

  const testCasesQuery = useQuery({
    queryKey: ['testCases', projectId],
    queryFn: () => testCasesApi.list({ projectId }),
    enabled: open,
  });

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
    retry: false,
    enabled: open,
  });

  const cycle = cycleQuery.data?.executionCycle;
  const executions = executionsQuery.data?.executions || EMPTY_ARRAY;
  const testCaseById = Object.fromEntries(
    (testCasesQuery.data?.testCases || []).map((testCase) => [testCase._id, testCase]),
  );
  const userNameById = Object.fromEntries(
    (usersQuery.data?.users || []).map((user) => [user._id, user.name]),
  );
  const rows = buildRows(executions, testCaseById);
  const activeRow = rows[activeIndex] || null;

  const isLoading = cycleQuery.isLoading || executionsQuery.isLoading || testCasesQuery.isLoading;
  const isError = cycleQuery.isError || executionsQuery.isError || testCasesQuery.isError;

  function handleClose() {
    setActiveIndex(0);
    onClose();
  }

  function navigateExecution(direction) {
    setActiveIndex((current) => {
      const next = current + direction;
      return next >= 0 && next < rows.length ? next : current;
    });
  }

  return (
    <Modal
      open={open}
      title={cycle ? t('executionCycles.executingTitle', { name: cycle.name }) : ''}
      onClose={handleClose}
      dialogMaxWidth="min(92vw, 64rem)"
      footer={activeRow ? <div ref={setFooterNode} className={styles.footerSlot} /> : null}
    >
      {isLoading && <LoadingState />}
      {!isLoading && isError && <ErrorState onRetry={() => executionsQuery.refetch()} />}
      {!isLoading && !isError && rows.length === 0 && (
        <EmptyState message={t('executionCycles.noExecutions')} />
      )}
      {!isLoading && !isError && activeRow && (
        <ExecutionDrawerContent
          key={activeRow._id}
          execution={activeRow}
          testCase={activeRow.testCase}
          projectId={projectId}
          cycleId={cycleId}
          userNameById={userNameById}
          onNavigate={navigateExecution}
          hasPrev={activeIndex > 0}
          hasNext={activeIndex < rows.length - 1}
          quickMode
          footerContainer={footerNode}
          progressLabel={t('executionCycles.progressLabel', {
            current: activeIndex + 1,
            total: rows.length,
          })}
        />
      )}
    </Modal>
  );
}
