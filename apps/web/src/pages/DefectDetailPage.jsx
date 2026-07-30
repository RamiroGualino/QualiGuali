import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { defectsApi } from '../api/defects.api';
import { PageHeader } from '../components/PageHeader';
import { BackButton } from '../components/BackButton';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';
import { ImageAnnotator } from '../components/ImageAnnotator';
import { LoadingState, ErrorState } from '../components/QueryStates';
import styles from './DefectDetailPage.module.css';

// Mirrors defects-service's state machine (src/services/statusTransition.service.js)
// purely for UX — only showing valid next steps. The backend is still the
// source of truth and enforces this regardless.
const VALID_TRANSITIONS = {
  open: ['in_progress'],
  in_progress: ['resolved'],
  resolved: ['closed', 'reopened'],
  closed: ['reopened'],
  reopened: ['in_progress'],
};

function EvidenceItem({ item, onEditImage }) {
  if (item.fileType === 'image') {
    return (
      <button
        type="button"
        className={styles.evidenceThumbButton}
        onClick={() => onEditImage(item)}
      >
        <img src={item.fileUrl} alt="" className={styles.evidenceThumb} />
      </button>
    );
  }
  if (item.fileType === 'video') {
    return <video src={item.fileUrl} controls className={styles.evidenceThumb} />;
  }
  return (
    <a href={item.fileUrl} target="_blank" rel="noreferrer">
      {item.fileType}
    </a>
  );
}

export function DefectDetailPage() {
  const { t } = useTranslation();
  const { defectId } = useParams();
  const queryClient = useQueryClient();
  const [commentText, setCommentText] = useState('');
  const [isEditingJira, setIsEditingJira] = useState(false);
  const [jiraUrlDraft, setJiraUrlDraft] = useState('');
  // Which evidence item is open in the editor, and the File built from its
  // (already-uploaded) fileUrl once fetched — null file while that fetch is
  // still in flight, so the modal can show a loading state first.
  const [editingEvidenceItem, setEditingEvidenceItem] = useState(null);
  const [editingEvidenceFile, setEditingEvidenceFile] = useState(null);

  const defectQuery = useQuery({
    queryKey: ['defect', defectId],
    queryFn: () => defectsApi.get(defectId),
  });

  const commentsQuery = useQuery({
    queryKey: ['defectComments', defectId],
    queryFn: () => defectsApi.listComments(defectId),
  });

  const evidenceQuery = useQuery({
    queryKey: ['defectEvidence', defectId],
    queryFn: () => defectsApi.listEvidence(defectId),
  });

  const statusMutation = useMutation({
    mutationFn: (status) => defectsApi.updateStatus(defectId, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['defect', defectId] }),
  });

  const jiraUrlMutation = useMutation({
    mutationFn: () => defectsApi.update(defectId, { jiraUrl: jiraUrlDraft }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['defect', defectId] });
      setIsEditingJira(false);
    },
  });

  function openEditJira() {
    setJiraUrlDraft(defect.jiraUrl || '');
    setIsEditingJira(true);
  }

  const commentMutation = useMutation({
    mutationFn: () => defectsApi.addComment(defectId, commentText),
    onSuccess: () => {
      setCommentText('');
      queryClient.invalidateQueries({ queryKey: ['defectComments', defectId] });
    },
  });

  // Evidence has no "update" endpoint — an edit is uploaded as a new
  // evidence entry, keeping the original untouched (same reasoning as the
  // execution evidence flow: never silently overwrite what was captured).
  const annotateMutation = useMutation({
    mutationFn: (file) => defectsApi.uploadEvidence(defectId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['defectEvidence', defectId] });
      closeEvidenceEditor();
    },
  });

  function openEvidenceEditor(item) {
    setEditingEvidenceItem(item);
    setEditingEvidenceFile(null);
    fetch(item.fileUrl)
      .then((response) => response.blob())
      .then((blob) => {
        const filename = item.fileUrl.split('/').pop() || 'evidence.png';
        setEditingEvidenceFile(new File([blob], filename, { type: blob.type || 'image/png' }));
      });
  }

  function closeEvidenceEditor() {
    setEditingEvidenceItem(null);
    setEditingEvidenceFile(null);
  }

  if (defectQuery.isLoading) {
    return (
      <div>
        <PageHeader title={t('defects.title')} leading={<BackButton />} />
        <LoadingState />
      </div>
    );
  }
  if (defectQuery.isError) {
    return (
      <div>
        <PageHeader title={t('defects.title')} leading={<BackButton />} />
        <ErrorState onRetry={defectQuery.refetch} />
      </div>
    );
  }

  const defect = defectQuery.data.defect;
  const comments = commentsQuery.data?.comments || [];
  const evidence = evidenceQuery.data?.evidence || [];
  const nextStatuses = VALID_TRANSITIONS[defect.status] || [];

  return (
    <div>
      <PageHeader title={`${defect.code} — ${defect.title}`} leading={<BackButton />} />

      <Card className={styles.section}>
        <p>{defect.description}</p>
        {defect.actualResult && (
          <>
            <p className={styles.sectionLabel}>{t('defects.actualResult')}</p>
            <p>{defect.actualResult}</p>
          </>
        )}
        <div className={styles.metaRow}>
          <StatusBadge status={defect.status} label={t(`defects.status_${defect.status}`)} />
          <span>{t(`defects.severity_${defect.severity}`)}</span>
        </div>

        <div className={styles.metaRow}>
          {isEditingJira ? (
            <>
              <TextField
                label={t('defects.jiraUrl')}
                value={jiraUrlDraft}
                onChange={setJiraUrlDraft}
                type="url"
                placeholder="https://your-domain.atlassian.net/browse/QG-1"
              />
              <Button
                size="lg"
                disabled={jiraUrlMutation.isPending}
                onClick={() => jiraUrlMutation.mutate()}
              >
                {t('common.save')}
              </Button>
              <Button variant="secondary" size="lg" onClick={() => setIsEditingJira(false)}>
                {t('common.cancel')}
              </Button>
            </>
          ) : defect.jiraUrl ? (
            <>
              <a href={defect.jiraUrl} target="_blank" rel="noreferrer">
                {t('defects.viewInJira')}
              </a>
              <Button variant="secondary" size="lg" onClick={openEditJira}>
                {t('common.edit')}
              </Button>
            </>
          ) : (
            <Button variant="secondary" size="lg" onClick={openEditJira}>
              {t('defects.jiraUrl')}
            </Button>
          )}
        </div>

        {nextStatuses.length > 0 && (
          <div className={styles.transitions}>
            <p className={styles.sectionLabel}>{t('defects.changeStatus')}</p>
            {nextStatuses.map((status) => (
              <Button
                key={status}
                size="lg"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate(status)}
              >
                {t(`defects.status_${status}`)}
              </Button>
            ))}
          </div>
        )}
      </Card>

      {evidence.length > 0 && (
        <Card className={styles.section}>
          <p className={styles.sectionLabel}>{t('defects.evidence')}</p>
          <div className={styles.evidenceGrid}>
            {evidence.map((item) => (
              <EvidenceItem key={item._id} item={item} onEditImage={openEvidenceEditor} />
            ))}
          </div>
        </Card>
      )}

      <Modal
        open={Boolean(editingEvidenceItem)}
        title={t('defects.editEvidence')}
        onClose={closeEvidenceEditor}
        disableBackdropClose
        dialogMaxWidth="70vw"
      >
        {!editingEvidenceFile && <LoadingState />}
        {editingEvidenceFile && (
          <ImageAnnotator
            file={editingEvidenceFile}
            onCancel={closeEvidenceEditor}
            onConfirm={(annotatedFile) => annotateMutation.mutate(annotatedFile)}
            confirming={annotateMutation.isPending}
          />
        )}
      </Modal>

      <Card className={styles.section}>
        <p className={styles.sectionLabel}>{t('defects.comments')}</p>
        <ul className={styles.commentList}>
          {comments.map((comment) => (
            <li key={comment._id}>{comment.text}</li>
          ))}
        </ul>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            commentMutation.mutate();
          }}
        >
          <TextField
            label={t('defects.addComment')}
            placeholder={t('defects.commentPlaceholder')}
            value={commentText}
            onChange={setCommentText}
            as="textarea"
          />
          <Button type="submit" disabled={!commentText || commentMutation.isPending}>
            {t('defects.addComment')}
          </Button>
        </form>
      </Card>
    </div>
  );
}
