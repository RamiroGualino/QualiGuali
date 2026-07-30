import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { executionsApi } from '../api/execution.api';
import { defectsApi } from '../api/defects.api';
import { stripLegacyStepNumber } from '../utils/testCaseSteps';
import { formatCaseLabel } from '../utils/executions';
import { Button } from './Button';
import { TextField } from './TextField';
import { Select } from './Select';
import { StatusBadge } from './StatusBadge';
import { Dropzone } from './Dropzone';
import { ImageAnnotator } from './ImageAnnotator';
import { Modal } from './Modal';
import { ConfirmModal } from './ConfirmModal';
import { ExpandableText } from './ExpandableText';
import { LoadingState } from './QueryStates';
import styles from './ExecutionDrawerContent.module.css';

const RESULT_STATUSES = ['pass', 'fail', 'blocked'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const EMPTY_ARRAY = [];
// A normal paragraph reads inline as always; only something well past what
// a human would type by hand (e.g. a pasted JSON blob) gets hidden behind
// a click.
const DETAIL_TEXT_MAX_LENGTH = 400;

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : '—';
}

// Import sources sometimes template the summary from the title itself (e.g.
// "Caso 3: <title>", occasionally with a literal "None" where their own
// numbering broke) — showing that back as a separate "Summary" section is
// just the title again with a label glued on. Loose match: strip a leading
// "Caso <anything>:" and compare case-insensitively.
function isRedundantSummary(summary, title) {
  if (!summary || !title) return false;
  const normalize = (value) =>
    value
      .replace(/^caso\s+\S+\s*:\s*/i, '')
      .trim()
      .toLowerCase();
  return normalize(summary) === normalize(title);
}

// Everything a tester already wrote up about this case, formatted into a
// starting point for the bug report — so "reportar defecto" doesn't begin
// from a blank page. Only sections the test case actually has get included.
function buildDefectDescription(testCase, t) {
  if (!testCase) return '';
  const parts = [];
  if (testCase.summary) parts.push(`${t('testCases.summary')}:\n${testCase.summary}`);
  if (testCase.preconditions) {
    parts.push(`${t('testCases.preconditions')}:\n${testCase.preconditions}`);
  }
  if (testCase.steps?.length > 0) {
    const stepsText = testCase.steps
      .map((step, index) => `${index + 1}. ${stripLegacyStepNumber(step.action)}`)
      .join('\n');
    parts.push(`${t('testCases.steps')}:\n${stepsText}`);
  }
  // Always included, even when the case has none set — expected result is
  // the whole point of comparing against "actual result" below, so it
  // shouldn't silently disappear from the write-up just because this case
  // never had one filled in.
  parts.push(`${t('testCases.sectionExpectedResult')}:\n${testCase.expectedResult || '—'}`);
  return parts.join('\n\n');
}

// onEdit is only offered for images — ImageAnnotator (the tool doing the
// editing) draws on a <canvas>, which only makes sense for a static image.
// onView/onDelete are opt-in so read-only contexts (Reports) can still show
// the enlarge-on-click lightbox without exposing removal.
function EvidenceItem({ item, onEdit, onView, onDelete }) {
  const { t } = useTranslation();

  if (item.fileType === 'image') {
    return (
      <div className={styles.evidenceItemWrapper}>
        <button type="button" className={styles.evidenceThumbButton} onClick={() => onView(item)}>
          <img src={item.fileUrl} alt="" className={styles.evidenceThumb} />
        </button>
        <div className={styles.evidenceItemActions}>
          <button
            type="button"
            className={styles.evidenceActionButton}
            onClick={() => onView(item)}
          >
            {t('common.view')}
          </button>
          {onEdit && (
            <button
              type="button"
              className={styles.evidenceActionButton}
              onClick={() => onEdit(item)}
            >
              {t('common.edit')}
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className={styles.evidenceActionButton}
              onClick={() => onDelete(item)}
            >
              {t('common.delete')}
            </button>
          )}
        </div>
      </div>
    );
  }
  if (item.fileType === 'video') {
    return (
      <div className={styles.evidenceItemWrapper}>
        <video src={item.fileUrl} controls className={styles.evidenceThumb} />
        {onDelete && (
          <div className={styles.evidenceItemActions}>
            <button
              type="button"
              className={styles.evidenceActionButton}
              onClick={() => onDelete(item)}
            >
              {t('common.delete')}
            </button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className={styles.evidenceItemWrapper}>
      <a href={item.fileUrl} target="_blank" rel="noreferrer">
        {item.fileType}
      </a>
      {onDelete && (
        <div className={styles.evidenceItemActions}>
          <button
            type="button"
            className={styles.evidenceActionButton}
            onClick={() => onDelete(item)}
          >
            {t('common.delete')}
          </button>
        </div>
      )}
    </div>
  );
}

// Full Kualitee-style "Test Case Execution" panel: read-only test case info
// (all fields already exist on TestCase from the Create/Edit redesign) plus
// the actual execution recording form and evidence upload — both already
// backed by existing execution-service endpoints, nothing new invented.
// Shared by ExecutionCycleDetailPage and ReportsDashboardPage so both use
// the exact same execution/evidence/defect view.
//
// Layout is deliberately dense — this opens as a side drawer, and a tester
// re-opens it dozens of times per cycle, so getting from "case info" to
// "mark result" without scrolling matters more than generous whitespace:
// metadata condenses into one badge row under the title, any field with no
// data (postconditions, assignee, ...) just doesn't render its row at all,
// and execution history — often empty on a case's first run — only takes
// space once there's actually something in it.
export function ExecutionDrawerContent({
  execution,
  testCase,
  projectId,
  cycleId,
  userNameById,
  onNavigate,
  hasPrev,
  hasNext,
  // Opt-in — the cycle quick-execution modal passes this to swap the normal
  // "pick a status, then Execute" footer for four one-tap buttons so a
  // tester can rip through every case in a cycle without touching a select.
  // Marking Fail/Pass/Blocked only records the result and stays on the same
  // case — advancing is always an explicit, separate "Siguiente" click.
  quickMode = false,
  // DOM node to portal the quick-mode action buttons into (the quick-exec
  // modal's sticky footer, kept outside the scrolling body) — only used
  // when quickMode is true.
  footerContainer = null,
  // "N de M" — folded into the compact header's badge row instead of
  // floating above it as its own paragraph, so the case number, code and
  // metadata read as one integrated block.
  progressLabel = null,
  // Opt-in — ReportsDashboardPage passes this: reviewing a past cycle's
  // results is not the same action as executing a case, so this view hides
  // "Registrar resultado", evidence upload and "Nuevo defecto" entirely.
  // Everything already recorded (case info, evidence, history, linked
  // defects) still shows — only the ability to add something new is gone.
  readOnly = false,
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(execution.status === 'not_executed' ? '' : execution.status);
  // Prefilled from the test case's own documented actual result (e.g. set
  // via the Excel Transformer) — but only on a case's very first execution.
  // Re-executing an already-run case starts this blank instead of showing
  // the previous attempt's write-up: that text is now history (see the
  // Execution history section below), and carrying it forward would make a
  // fresh attempt look like a no-op resubmission of the old one.
  const isFirstAttempt = execution.status === 'not_executed';
  const [comments, setComments] = useState(isFirstAttempt ? testCase?.actualResult || '' : '');
  // Expanded whenever there's actually something to show — the test case's
  // documented actual result, prefilled above on a first attempt — so a
  // tester sees (and can correct) what's about to be submitted instead of it
  // silently riding along hidden behind the link. Blank on every other case
  // (including re-attempts) starts collapsed.
  const [isCommentsExpanded, setIsCommentsExpanded] = useState(
    isFirstAttempt && Boolean(testCase?.actualResult),
  );
  // A file picked/pasted/dropped waits here for the user to preview it (and,
  // for images, annotate it) before it's actually uploaded.
  const [pendingFile, setPendingFile] = useState(null);
  // Lets submitResult pull whatever's currently drawn on the annotator's
  // canvas at submit time, instead of just the untouched original file.
  const annotatorRef = useRef(null);
  const [isCreateDefectOpen, setIsCreateDefectOpen] = useState(false);
  const [defectTitle, setDefectTitle] = useState('');
  const [defectDescription, setDefectDescription] = useState('');
  const [defectActualResult, setDefectActualResult] = useState('');
  const [defectSeverity, setDefectSeverity] = useState('medium');
  // Staged locally (the defect doesn't exist yet to attach evidence to) —
  // uploaded one by one, right after creation succeeds.
  const [defectEvidenceFiles, setDefectEvidenceFiles] = useState([]);
  // Index into defectEvidenceFiles currently open in the annotator, or null
  // — clicking a staged photo lets you mark it up before the defect (and
  // its evidence) even exist yet, same toolbar as editing evidence that's
  // already been uploaded.
  const [editingStagedEvidenceIndex, setEditingStagedEvidenceIndex] = useState(null);
  // Unassociated evidence (a rare edge case) stays collapsed by default — a
  // toggle keeps it one click away without eating vertical space up front.
  // Execution history is expanded by default: past attempts, their
  // comments, and evidence are exactly what a tester checks before
  // re-executing a case, not reference material to dig for.
  const [isEvidenceExpanded, setIsEvidenceExpanded] = useState(false);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(true);
  // Re-annotating evidence that's already been uploaded (any past attempt,
  // not just the current one): the evidence row itself, plus the fetched
  // File once its image has downloaded — the annotator needs an actual
  // File to draw on, not just a URL, so there's a brief loading gap
  // between picking "Editar" and the canvas being ready.
  const [editingEvidenceItem, setEditingEvidenceItem] = useState(null);
  const [editingEvidenceFile, setEditingEvidenceFile] = useState(null);

  function closeEvidenceEditor() {
    setEditingEvidenceItem(null);
    setEditingEvidenceFile(null);
  }

  async function startEditEvidence(item) {
    setEditingEvidenceItem(item);
    setEditingEvidenceFile(null);
    try {
      const response = await fetch(item.fileUrl);
      const blob = await response.blob();
      setEditingEvidenceFile(new File([blob], 'evidence', { type: blob.type || 'image/png' }));
    } catch {
      closeEvidenceEditor();
    }
  }

  // History entry the delete confirmation is currently open for, or null.
  const [deletingHistoryEntry, setDeletingHistoryEntry] = useState(null);
  // Evidence item shown enlarged in the lightbox, or null.
  const [viewingEvidenceItem, setViewingEvidenceItem] = useState(null);
  // Evidence item the delete confirmation is currently open for, or null.
  const [deletingEvidenceItem, setDeletingEvidenceItem] = useState(null);
  // Which history entry has its inline "add photo" Dropzone expanded, or
  // null — only one at a time, since Dropzone's paste listener is global
  // (window-level) and two expanded at once couldn't tell which entry a
  // Ctrl+V paste was meant for.
  const [addPhotoTargetId, setAddPhotoTargetId] = useState(null);

  function toggleAddPhoto(historyId) {
    setAddPhotoTargetId((current) => (current === historyId ? null : historyId));
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['executions', cycleId] });
    queryClient.invalidateQueries({ queryKey: ['executionHistory', execution._id] });
  };

  const resultMutation = useMutation({
    mutationFn: (payload) => executionsApi.update(execution._id, payload),
    onSuccess: invalidate,
  });

  const historyQuery = useQuery({
    queryKey: ['executionHistory', execution._id],
    queryFn: () => executionsApi.listHistory(execution._id),
  });

  const evidenceQuery = useQuery({
    queryKey: ['evidence', execution._id],
    queryFn: () => executionsApi.listEvidence(execution._id),
  });

  const uploadMutation = useMutation({
    mutationFn: (file) => executionsApi.uploadEvidence(execution._id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence', execution._id] });
      setPendingFile(null);
    },
  });

  const updateEvidenceMutation = useMutation({
    mutationFn: (file) =>
      executionsApi.updateEvidence(execution._id, editingEvidenceItem._id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence', execution._id] });
      closeEvidenceEditor();
    },
  });

  // Adds another photo to a specific (not necessarily latest) past attempt
  // — the on-screen counterpart to uploadEvidence's optional
  // executionHistoryId, so a case's whole timeline doesn't have to stay
  // limited to one image per attempt.
  const addEvidenceToEntryMutation = useMutation({
    mutationFn: ({ historyId, file }) =>
      executionsApi.uploadEvidence(execution._id, file, undefined, historyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence', execution._id] });
      setAddPhotoTargetId(null);
    },
  });

  // Removing a single photo — unlike deleteHistoryMutation below, this never
  // touches the recorded status, so no invalidate() (executions/history)
  // needed, just the evidence list.
  const deleteEvidenceMutation = useMutation({
    mutationFn: (evidenceId) => executionsApi.deleteEvidence(execution._id, evidenceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence', execution._id] });
      setDeletingEvidenceItem(null);
    },
  });

  // Removing a mistaken/duplicate attempt — its evidence goes with it (see
  // deleteExecutionHistoryEntry). If it was the latest attempt, every other
  // screen reading this execution's current status needs to hear about the
  // resulting change too, same as any other result update.
  const deleteHistoryMutation = useMutation({
    mutationFn: (historyId) => executionsApi.deleteHistoryEntry(execution._id, historyId),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['evidence', execution._id] });
      setDeletingHistoryEntry(null);
    },
  });

  // A screenshot dropped into the Evidence dropzone only *stages* it
  // (pendingFile) — there's no separate "confirm" step for it anymore. A
  // tester marking a result right after dropping/annotating a file
  // shouldn't have to remember an extra click, so submitting a result also
  // uploads whatever's still staged — the current annotated canvas for an
  // image (via the ref), the raw file as-is for anything else.
  //
  // Order matters: the result is submitted *first*, then the file is
  // uploaded. evidence.controller.js's uploadEvidence claims whichever
  // ExecutionHistory row is current-latest at upload time — submitting
  // first means that's the row this click just created, not whatever was
  // latest before it (which is what a tester dropping evidence to prep the
  // *next* attempt actually means for it to land on).
  async function submitResult(payload, options) {
    await resultMutation.mutateAsync(payload, options);
    if (pendingFile) {
      const fileToUpload =
        pendingFile.type.startsWith('image/') && annotatorRef.current
          ? await annotatorRef.current.getAnnotatedFile()
          : pendingFile;
      await uploadMutation.mutateAsync(fileToUpload);
    }
  }

  // Quick-mode's one-tap buttons skip the status <Select> entirely — they
  // set the status and submit in the same click. Advancing to the next case
  // is always a separate, explicit "Siguiente" click. Pass/Blocked also
  // clear the actual-result field back to blank on success, ready for a
  // fresh write-up if this same case gets re-executed without navigating
  // away; Fail deliberately leaves it in place since "Crear defecto" reads
  // it right after.
  function handleQuickMark(value) {
    setStatus(value);
    submitResult(
      { status: value, comments },
      {
        onSuccess: () => {
          if (value !== 'fail') {
            setComments('');
            setIsCommentsExpanded(false);
          }
        },
      },
    );
  }

  // Related defects come straight from defects-service (ground truth), not
  // from reports-service's event-derived cache, which has already been
  // shown to drift when events are lost.
  const defectsQuery = useQuery({
    queryKey: ['defects', projectId, execution._id],
    queryFn: () => defectsApi.list({ projectId, linkedExecutionId: execution._id }),
    enabled: Boolean(projectId) && execution.status === 'fail',
  });

  const createDefectMutation = useMutation({
    mutationFn: async () => {
      const { defect } = await defectsApi.create({
        projectId,
        title: defectTitle,
        description: defectDescription,
        actualResult: defectActualResult,
        severity: defectSeverity,
        linkedExecutionId: execution._id,
      });
      // Sequential, not Promise.all — mirrors the same one-at-a-time
      // pattern used elsewhere for batched creates, and keeps upload order
      // predictable if one fails partway through.
      for (const file of defectEvidenceFiles) {
        await defectsApi.uploadEvidence(defect._id, file);
      }
      return defect;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['defects', projectId, execution._id] });
      setIsCreateDefectOpen(false);
    },
  });

  function openCreateDefect() {
    setDefectTitle(testCase ? formatCaseLabel(testCase.testCaseId, testCase.title) : '');
    setDefectDescription(buildDefectDescription(testCase, t));
    // The comments the tester just typed while marking this Fail are
    // exactly what actually happened — the defect's actual result, not its
    // free-form description.
    setDefectActualResult(comments);
    setDefectSeverity('medium');
    setDefectEvidenceFiles([]);
    setEditingStagedEvidenceIndex(null);
    setIsCreateDefectOpen(true);
  }

  function addDefectEvidenceFiles(fileList) {
    setDefectEvidenceFiles((current) => [...current, ...Array.from(fileList)]);
  }

  function removeDefectEvidenceFile(index) {
    setDefectEvidenceFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
  }

  function replaceStagedEvidenceFile(index, file) {
    setDefectEvidenceFiles((current) => current.map((f, i) => (i === index ? file : f)));
    setEditingStagedEvidenceIndex(null);
  }

  // Executions registered before history tracking existed have no
  // ExecutionHistory row — fall back to a single entry built from the
  // Execution doc itself so an old "Pass" doesn't read as "never executed".
  const fetchedHistory = historyQuery.data?.history || EMPTY_ARRAY;
  const history =
    fetchedHistory.length === 0 && execution.status !== 'not_executed'
      ? [
          {
            _id: 'legacy',
            status: execution.status,
            comments: execution.comments,
            executedBy: execution.executedBy,
            executedAt: execution.executedAt,
          },
        ]
      : fetchedHistory;
  const evidence = evidenceQuery.data?.evidence || EMPTY_ARRAY;
  const evidenceByHistoryId = {};
  const unassociatedEvidence = [];
  evidence.forEach((item) => {
    if (item.executionHistoryId) {
      evidenceByHistoryId[item.executionHistoryId] ||= [];
      evidenceByHistoryId[item.executionHistoryId].push(item);
    } else {
      unassociatedEvidence.push(item);
    }
  });
  const defects = defectsQuery.data?.defects || EMPTY_ARRAY;
  const hasEstimatedTime =
    testCase?.estimatedTime !== null && testCase?.estimatedTime !== undefined;

  return (
    <div>
      {!quickMode && (
        <div className={styles.drawerNav}>
          <Button variant="secondary" onClick={() => onNavigate(-1)} disabled={!hasPrev}>
            {t('common.back')}
          </Button>
          <Button variant="secondary" onClick={() => onNavigate(1)} disabled={!hasNext}>
            {t('common.next')}
          </Button>
        </div>
      )}

      {testCase ? (
        <>
          <div className={styles.caseHeader}>
            <h3 className={styles.caseTitle}>
              {testCase.testCaseId && `${testCase.testCaseId}: `}
              <ExpandableText
                text={testCase.title}
                label={t('testCases.titleField')}
                maxLength={DETAIL_TEXT_MAX_LENGTH}
              />
            </h3>
            <div className={styles.metaRow}>
              {progressLabel && (
                <span className={[styles.metaChip, styles.metaChipProgress].join(' ')}>
                  {progressLabel}
                </span>
              )}
              <span className={styles.metaChip}>{formatDateTime(testCase.createdAt)}</span>
              {testCase.build && <span className={styles.metaChip}>{testCase.build}</span>}
              <span className={styles.metaChip}>
                {t(`testCases.executionType_${testCase.executionType}`)}
              </span>
              <span className={styles.metaChip}>
                {t(`testCases.testingType_${testCase.testingType}`)}
              </span>
              <StatusBadge
                status={testCase.status}
                label={t(`testCases.status_${testCase.status}`)}
              />
              <StatusBadge
                status={testCase.priority}
                label={t(`requirements.priority_${testCase.priority}`)}
              />
            </div>
            {(testCase.assignee || hasEstimatedTime) && (
              <div className={styles.metaRow}>
                {testCase.assignee && (
                  <span className={styles.metaChipMuted}>
                    {t('testCases.assignee')}: {testCase.assignee}
                  </span>
                )}
                {hasEstimatedTime && (
                  <span className={styles.metaChipMuted}>
                    {t('testCases.estimatedTime')}: {testCase.estimatedTime}
                  </span>
                )}
              </div>
            )}
          </div>

          <dl className={styles.drawerInfo}>
            {testCase.summary && !isRedundantSummary(testCase.summary, testCase.title) && (
              <div className={styles.drawerInfoWide}>
                <dt>{t('testCases.summary')}</dt>
                <dd>
                  <ExpandableText
                    text={testCase.summary}
                    label={t('testCases.summary')}
                    maxLength={DETAIL_TEXT_MAX_LENGTH}
                    multiline
                  />
                </dd>
              </div>
            )}
            {testCase.preconditions && (
              <div className={styles.drawerInfoWide}>
                <dt>{t('testCases.preconditions')}</dt>
                <dd>
                  <ExpandableText
                    text={testCase.preconditions}
                    label={t('testCases.preconditions')}
                    maxLength={DETAIL_TEXT_MAX_LENGTH}
                    multiline
                  />
                </dd>
              </div>
            )}
            {testCase.steps?.length > 0 && (
              <div className={styles.drawerInfoWide}>
                <dt>{t('testCases.steps')}</dt>
                <dd>
                  <ol className={styles.stepsList}>
                    {testCase.steps.map((step, index) => (
                      <li key={index}>
                        <strong>
                          <ExpandableText
                            text={stripLegacyStepNumber(step.action)}
                            label={t('testCases.steps')}
                            maxLength={DETAIL_TEXT_MAX_LENGTH}
                            multiline
                          />
                        </strong>
                        {step.expectedResult && (
                          <>
                            {' '}
                            →{' '}
                            <ExpandableText
                              text={step.expectedResult}
                              label={t('testCases.sectionExpectedResult')}
                              maxLength={DETAIL_TEXT_MAX_LENGTH}
                              multiline
                            />
                          </>
                        )}
                      </li>
                    ))}
                  </ol>
                </dd>
              </div>
            )}
            {testCase.expectedResult && (
              <div className={styles.drawerInfoWide}>
                <dt>{t('testCases.sectionExpectedResult')}</dt>
                <dd>
                  <ExpandableText
                    text={testCase.expectedResult}
                    label={t('testCases.sectionExpectedResult')}
                    maxLength={DETAIL_TEXT_MAX_LENGTH}
                    multiline
                  />
                </dd>
              </div>
            )}
            {testCase.postconditions && (
              <div className={styles.drawerInfoWide}>
                <dt>{t('testCases.postconditions')}</dt>
                <dd>
                  <ExpandableText
                    text={testCase.postconditions}
                    label={t('testCases.postconditions')}
                    maxLength={DETAIL_TEXT_MAX_LENGTH}
                    multiline
                  />
                </dd>
              </div>
            )}
            {testCase.comments && (
              <div className={styles.drawerInfoWide}>
                <dt>{t('testCases.comments')}</dt>
                <dd>
                  <ExpandableText
                    text={testCase.comments}
                    label={t('testCases.comments')}
                    maxLength={DETAIL_TEXT_MAX_LENGTH}
                    multiline
                  />
                </dd>
              </div>
            )}
          </dl>
        </>
      ) : (
        <p className={styles.hint}>{execution.testCaseId}</p>
      )}

      {execution.status === 'fail' && (
        <div className={styles.drawerSection}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionLabel}>{t('reports.relatedDefects')}</p>
            {!readOnly && (
              <Button variant="secondary" onClick={openCreateDefect}>
                {t('defects.createButton')}
              </Button>
            )}
          </div>
          {defectsQuery.isLoading && <LoadingState />}
          {!defectsQuery.isLoading && defects.length === 0 && (
            <p className={styles.hint}>{t('reports.noRelatedDefects')}</p>
          )}
          {defects.length > 0 && (
            <ul className={styles.defectList}>
              {defects.map((defect) => (
                <li key={defect._id}>
                  <Link
                    to={`/projects/${projectId}/defects/${defect._id}`}
                    className={styles.defectItem}
                  >
                    <span className={styles.defectCode}>{defect.code}</span>
                    <span className={styles.defectTitle}>{defect.title}</span>
                    <StatusBadge
                      status={defect.severity}
                      label={t(`defects.severity_${defect.severity}`)}
                    />
                    <StatusBadge
                      status={defect.status}
                      label={t(`defects.status_${defect.status}`)}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!readOnly && (
        <div className={styles.drawerSection}>
          <p className={styles.sectionLabel}>{t('executions.markResult')}</p>
          {!quickMode && (
            <Select
              label={t('common.status')}
              value={status}
              onChange={setStatus}
              required
              options={[
                { value: '', label: t('common.none') },
                ...RESULT_STATUSES.map((value) => ({
                  value,
                  label: t(`executions.status_${value}`),
                })),
              ]}
            />
          )}
          {isCommentsExpanded ? (
            <TextField
              label={t('executions.actualResult')}
              value={comments}
              onChange={setComments}
              as="textarea"
            />
          ) : (
            <button
              type="button"
              className={styles.addCommentLink}
              onClick={() => setIsCommentsExpanded(true)}
            >
              + {t('executions.addActualResult')}
            </button>
          )}
          {!quickMode && (
            <Button
              onClick={() => submitResult({ status, comments })}
              disabled={!status || resultMutation.isPending || uploadMutation.isPending}
            >
              {t('executions.execute')}
            </Button>
          )}
        </div>
      )}

      {!readOnly &&
        quickMode &&
        footerContainer &&
        createPortal(
          <div className={styles.quickActionsRow}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onNavigate(-1)}
              disabled={!hasPrev}
            >
              {t('executions.previous')}
            </Button>
            <Button
              variant="danger"
              onClick={() => handleQuickMark('fail')}
              disabled={resultMutation.isPending || uploadMutation.isPending}
            >
              {t('executions.status_fail')}
            </Button>
            <Button
              variant="pass"
              onClick={() => handleQuickMark('pass')}
              disabled={resultMutation.isPending || uploadMutation.isPending}
            >
              {t('executions.status_pass')}
            </Button>
            <Button
              variant="warning"
              onClick={() => handleQuickMark('blocked')}
              disabled={resultMutation.isPending || uploadMutation.isPending}
            >
              {t('executions.status_blocked')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onNavigate(1)} disabled={!hasNext}>
              {t('executions.next')}
            </Button>
          </div>,
          footerContainer,
        )}

      <div className={styles.drawerSection}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionLabel}>{t('executions.evidence')}</p>
          {unassociatedEvidence.length > 0 && (
            <button
              type="button"
              className={styles.sectionToggleLink}
              onClick={() => setIsEvidenceExpanded((current) => !current)}
            >
              {isEvidenceExpanded
                ? t('executions.hideEvidence')
                : t('executions.viewEvidence', { count: unassociatedEvidence.length })}
            </button>
          )}
        </div>
        {isEvidenceExpanded && unassociatedEvidence.length > 0 && (
          <>
            <p className={styles.hint}>{t('executions.unassociatedEvidence')}</p>
            <div className={styles.evidenceGrid}>
              {unassociatedEvidence.map((item, index) => (
                <EvidenceItem
                  key={index}
                  item={item}
                  onEdit={startEditEvidence}
                  onView={setViewingEvidenceItem}
                  onDelete={readOnly ? undefined : setDeletingEvidenceItem}
                />
              ))}
            </div>
          </>
        )}
        {!readOnly &&
          (pendingFile ? (
            pendingFile.type.startsWith('image/') ? (
              <ImageAnnotator
                ref={annotatorRef}
                file={pendingFile}
                hideActions
                onRemove={() => setPendingFile(null)}
              />
            ) : (
              <div className={styles.filePreview}>
                {pendingFile.type.startsWith('video/') ? (
                  <video
                    src={URL.createObjectURL(pendingFile)}
                    controls
                    className={styles.evidenceThumb}
                  />
                ) : (
                  <p>{pendingFile.name}</p>
                )}
                <div className={styles.actions}>
                  <Button variant="secondary" onClick={() => setPendingFile(null)}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    onClick={() => uploadMutation.mutate(pendingFile)}
                    disabled={uploadMutation.isPending}
                  >
                    {t('evidenceAnnotator.confirm')}
                  </Button>
                </div>
              </div>
            )
          ) : (
            <Dropzone
              hint={t('executions.dropEvidenceHint')}
              accept="image/*,video/*"
              // Dropzone's paste listener is global (window-level) — while a
              // history entry's own add-photo Dropzone is expanded below, it
              // owns Ctrl+V, otherwise a single paste would be grabbed by
              // both at once (staged here AND uploaded to that entry).
              pasteEnabled={!addPhotoTargetId}
              compact
              onFiles={(files) => setPendingFile(files[0])}
            />
          ))}
        {readOnly && unassociatedEvidence.length === 0 && (
          <p className={styles.hint}>{t('executions.noEvidence')}</p>
        )}
      </div>

      {(quickMode || history.length > 0) && (
        <div className={styles.drawerSection}>
          <button
            type="button"
            className={styles.accordionToggle}
            onClick={() => setIsHistoryExpanded((current) => !current)}
          >
            <span className={styles.sectionLabel}>
              {t('executions.history')}
              {history.length > 0 ? ` (${history.length})` : ''}
            </span>
            <span aria-hidden="true">{isHistoryExpanded ? '▾' : '▸'}</span>
          </button>
          {isHistoryExpanded && history.length === 0 && (
            <p className={styles.hint}>{t('executions.notExecutedYet')}</p>
          )}
          <ul className={styles.historyList}>
            {isHistoryExpanded &&
              history.map((entry) => (
                <li key={entry._id} className={styles.historyEntry}>
                  <div className={styles.historyEntryHeader}>
                    <StatusBadge
                      status={entry.status}
                      label={t(`executions.status_${entry.status}`)}
                    />
                    <span>{formatDateTime(entry.executedAt)}</span>
                    <span>{userNameById[entry.executedBy] || entry.executedBy || '—'}</span>
                    {/* No real ExecutionHistory row behind a legacy
                        (pre-history-tracking) entry — nothing to delete or
                        attach evidence to. */}
                    {!readOnly && entry._id !== 'legacy' && (
                      <button
                        type="button"
                        className={styles.historyDeleteButton}
                        onClick={() => setDeletingHistoryEntry(entry)}
                        aria-label={t('executions.deleteHistoryEntry')}
                        title={t('executions.deleteHistoryEntry')}
                      >
                        🗑
                      </button>
                    )}
                  </div>
                  {entry.comments && (
                    <p className={styles.historyComments}>
                      <strong>{t('executions.actualResult')}:</strong>{' '}
                      <ExpandableText
                        text={entry.comments}
                        label={t('executions.actualResult')}
                        maxLength={DETAIL_TEXT_MAX_LENGTH}
                        multiline
                      />
                    </p>
                  )}
                  {evidenceByHistoryId[entry._id]?.length > 0 && (
                    <div className={styles.evidenceGrid}>
                      {evidenceByHistoryId[entry._id].map((item, index) => (
                        <EvidenceItem
                          key={index}
                          item={item}
                          onEdit={startEditEvidence}
                          onView={setViewingEvidenceItem}
                          onDelete={readOnly ? undefined : setDeletingEvidenceItem}
                        />
                      ))}
                    </div>
                  )}
                  {!readOnly &&
                    entry._id !== 'legacy' &&
                    (addPhotoTargetId === entry._id ? (
                      <div className={styles.addPhotoDropzone}>
                        <Dropzone
                          hint={t('executions.addPhotoHint')}
                          accept="image/*,video/*"
                          pasteEnabled
                          compact
                          onFiles={(files) =>
                            addEvidenceToEntryMutation.mutate({
                              historyId: entry._id,
                              file: files[0],
                            })
                          }
                        />
                        <button
                          type="button"
                          className={styles.sectionToggleLink}
                          onClick={() => setAddPhotoTargetId(null)}
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={styles.sectionToggleLink}
                        onClick={() => toggleAddPhoto(entry._id)}
                      >
                        + {t('executions.addPhoto')}
                      </button>
                    ))}
                </li>
              ))}
          </ul>
        </div>
      )}

      <Modal
        open={isCreateDefectOpen}
        title={t('defects.createTitle')}
        onClose={() => setIsCreateDefectOpen(false)}
        disableBackdropClose
        variant="drawer"
        drawerWidth="50vw"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createDefectMutation.mutate();
          }}
        >
          <TextField
            label={t('defects.titleField')}
            value={defectTitle}
            onChange={setDefectTitle}
            required
          />
          <TextField
            label={t('common.description')}
            value={defectDescription}
            onChange={setDefectDescription}
            as="textarea"
            rows={8}
          />
          <TextField
            label={t('defects.actualResult')}
            value={defectActualResult}
            onChange={setDefectActualResult}
            as="textarea"
            rows={3}
          />
          <Select
            label={t('defects.severity')}
            value={defectSeverity}
            onChange={setDefectSeverity}
            options={SEVERITIES.map((value) => ({ value, label: t(`defects.severity_${value}`) }))}
          />

          <p className={styles.sectionLabel}>{t('defects.evidence')}</p>
          {editingStagedEvidenceIndex !== null ? (
            <ImageAnnotator
              file={defectEvidenceFiles[editingStagedEvidenceIndex]}
              onCancel={() => setEditingStagedEvidenceIndex(null)}
              onConfirm={(annotatedFile) =>
                replaceStagedEvidenceFile(editingStagedEvidenceIndex, annotatedFile)
              }
            />
          ) : (
            <>
              {defectEvidenceFiles.length > 0 && (
                <div className={styles.evidenceGrid}>
                  {defectEvidenceFiles.map((file, index) => (
                    <div key={index} className={styles.stagedEvidenceItem}>
                      {file.type.startsWith('image/') ? (
                        <button
                          type="button"
                          className={styles.evidenceThumbButton}
                          onClick={() => setEditingStagedEvidenceIndex(index)}
                        >
                          <img
                            src={URL.createObjectURL(file)}
                            alt=""
                            className={styles.evidenceThumb}
                          />
                        </button>
                      ) : file.type.startsWith('video/') ? (
                        <video
                          src={URL.createObjectURL(file)}
                          controls
                          className={styles.evidenceThumb}
                        />
                      ) : (
                        <p className={styles.hint}>{file.name}</p>
                      )}
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => removeDefectEvidenceFile(index)}
                      >
                        {t('common.remove')}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <Dropzone
                hint={t('defects.dropEvidenceHint')}
                accept="image/*,video/*"
                multiple
                pasteEnabled
                onFiles={addDefectEvidenceFiles}
              />
            </>
          )}

          <div className={styles.actions}>
            <Button type="submit" disabled={createDefectMutation.isPending}>
              {t('common.create')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(editingEvidenceItem)}
        title={t('executions.editEvidence')}
        onClose={closeEvidenceEditor}
        disableBackdropClose
        dialogMaxWidth="min(90vw, 50rem)"
      >
        {editingEvidenceFile ? (
          <ImageAnnotator
            file={editingEvidenceFile}
            onCancel={closeEvidenceEditor}
            onConfirm={(file) => updateEvidenceMutation.mutate(file)}
            confirming={updateEvidenceMutation.isPending}
          />
        ) : (
          <LoadingState />
        )}
      </Modal>

      <ConfirmModal
        open={Boolean(deletingHistoryEntry)}
        title={t('executions.deleteHistoryEntry')}
        message={t('executions.confirmDeleteHistoryEntry')}
        onCancel={() => setDeletingHistoryEntry(null)}
        onConfirm={() => deleteHistoryMutation.mutate(deletingHistoryEntry._id)}
        isConfirming={deleteHistoryMutation.isPending}
      />

      <Modal
        open={Boolean(viewingEvidenceItem)}
        title={t('executions.evidence')}
        onClose={() => setViewingEvidenceItem(null)}
        dialogMaxWidth="min(95vw, 60rem)"
      >
        {viewingEvidenceItem?.fileType === 'video' ? (
          <video src={viewingEvidenceItem.fileUrl} controls className={styles.lightboxMedia} />
        ) : (
          <img src={viewingEvidenceItem?.fileUrl} alt="" className={styles.lightboxMedia} />
        )}
      </Modal>

      <ConfirmModal
        open={Boolean(deletingEvidenceItem)}
        title={t('executions.deleteEvidence')}
        message={t('executions.confirmDeleteEvidence')}
        onCancel={() => setDeletingEvidenceItem(null)}
        onConfirm={() => deleteEvidenceMutation.mutate(deletingEvidenceItem._id)}
        isConfirming={deleteEvidenceMutation.isPending}
      />
    </div>
  );
}
