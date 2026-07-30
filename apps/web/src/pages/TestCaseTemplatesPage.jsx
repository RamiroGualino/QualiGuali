import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { testCaseTemplatesApi } from '../api/qaCore.api';
import { downloadSpreadsheetTemplate } from '../utils/spreadsheet';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { TextField } from '../components/TextField';
import { Select } from '../components/Select';
import { Table } from '../components/Table';
import { LoadingState, ErrorState, EmptyState } from '../components/QueryStates';
import styles from './TestCaseTemplatesPage.module.css';

const FIELD_TYPES = ['text', 'number', 'boolean', 'select'];

function emptyField() {
  return { key: '', label: '', type: 'text', required: false };
}

// The exact column set used across Create/Edit Test Case and the Excel
// Transformer's mapping — this is "our test case format," offered
// pre-filled as the starting point for a downloadable template. Translated
// via a function, not a module-level constant, since it needs `t`.
function defaultColumnLabels(t) {
  return [
    t('testSuites.title'),
    t('testCases.build'),
    t('testCases.testCaseId'),
    t('testCases.titleField'),
    t('testCases.summary'),
    t('common.status'),
    t('requirements.priority'),
    t('testCases.executionType'),
    t('testCases.testingType'),
    t('testCases.preconditions'),
    t('testCases.steps'),
    t('testCases.sectionExpectedResult'),
    t('testCases.actualResult'),
    t('testCases.comments'),
  ];
}

export function TestCaseTemplatesPage() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const queryClient = useQueryClient();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [fields, setFields] = useState([emptyField()]);

  // Column ids are separate from their (editable, so non-stable) label —
  // otherwise renaming a column while typing would remount its input on
  // every keystroke. crypto.randomUUID() (not a ref counter) so this stays
  // safe to call from the useState lazy initializer too, not just event
  // handlers.
  function makeColumn(label) {
    return { id: crypto.randomUUID(), label };
  }
  const [excelColumns, setExcelColumns] = useState(() =>
    defaultColumnLabels(t).map((label) => makeColumn(label)),
  );

  function updateColumnLabel(id, label) {
    setExcelColumns((current) => current.map((col) => (col.id === id ? { ...col, label } : col)));
  }

  function removeColumn(id) {
    setExcelColumns((current) => current.filter((col) => col.id !== id));
  }

  function addColumn() {
    setExcelColumns((current) => [...current, makeColumn('')]);
  }

  function resetColumns() {
    setExcelColumns(defaultColumnLabels(t).map((label) => makeColumn(label)));
  }

  function handleDownloadExcel() {
    const headers = excelColumns.map((col) => col.label.trim()).filter(Boolean);
    downloadSpreadsheetTemplate('plantilla-casos-de-prueba.xlsx', headers);
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['testCaseTemplates', projectId],
    queryFn: () => testCaseTemplatesApi.list(projectId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      testCaseTemplatesApi.create({
        projectId,
        name,
        fields: fields.filter((field) => field.key && field.label),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testCaseTemplates', projectId] });
      setIsCreateOpen(false);
      setName('');
      setFields([emptyField()]);
    },
  });

  function updateField(index, patch) {
    setFields((current) =>
      current.map((field, i) => (i === index ? { ...field, ...patch } : field)),
    );
  }

  const templates = data?.templates || [];

  return (
    <div>
      <PageHeader
        title={t('testCaseTemplates.title')}
        action={
          <Button onClick={() => setIsCreateOpen(true)}>
            {t('testCaseTemplates.createButton')}
          </Button>
        }
      />

      <Card className={styles.section}>
        <p className={styles.sectionLabel}>{t('testCaseTemplates.excelTemplateTitle')}</p>
        <p className={styles.excelTemplateHint}>{t('testCaseTemplates.excelTemplateHint')}</p>

        {excelColumns.map((column) => (
          <div className={styles.columnRow} key={column.id}>
            <TextField
              value={column.label}
              onChange={(value) => updateColumnLabel(column.id, value)}
              placeholder={t('testCaseTemplates.columnLabel')}
            />
            <Button variant="secondary" onClick={() => removeColumn(column.id)}>
              {t('common.remove')}
            </Button>
          </div>
        ))}

        <div className={styles.excelTemplateActions}>
          <Button type="button" variant="secondary" onClick={addColumn}>
            {t('testCaseTemplates.addColumn')}
          </Button>
          <Button type="button" variant="secondary" onClick={resetColumns}>
            {t('testCaseTemplates.resetColumns')}
          </Button>
          <Button
            type="button"
            onClick={handleDownloadExcel}
            disabled={!excelColumns.some((col) => col.label.trim())}
          >
            {t('testCaseTemplates.downloadExcel')}
          </Button>
        </div>
      </Card>

      <Card>
        {isLoading && <LoadingState />}
        {isError && <ErrorState onRetry={refetch} />}
        {!isLoading && !isError && templates.length === 0 && (
          <EmptyState message={t('testCaseTemplates.emptyState')} />
        )}
        {!isLoading && !isError && templates.length > 0 && (
          <Table
            columns={[
              { key: 'name', header: t('common.name') },
              {
                key: 'fields',
                header: t('testCaseTemplates.fields'),
                render: (row) => row.fields.map((field) => field.label).join(', '),
              },
              {
                key: 'isDefault',
                header: t('testCaseTemplates.isDefault'),
                render: (row) => (row.isDefault ? t('common.yes') : t('common.no')),
              },
            ]}
            rows={templates}
          />
        )}
      </Card>

      <Modal
        open={isCreateOpen}
        title={t('testCaseTemplates.createTitle')}
        onClose={() => setIsCreateOpen(false)}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
        >
          <TextField label={t('common.name')} value={name} onChange={setName} required />

          <p className={styles.sectionLabel}>{t('testCaseTemplates.fields')}</p>
          {fields.map((field, index) => (
            <div className={styles.fieldRow} key={index}>
              <TextField
                label={t('testCaseTemplates.fieldKey')}
                value={field.key}
                onChange={(value) => updateField(index, { key: value })}
              />
              <TextField
                label={t('testCaseTemplates.fieldLabel')}
                value={field.label}
                onChange={(value) => updateField(index, { label: value })}
              />
              <Select
                label={t('testCaseTemplates.fieldType')}
                value={field.type}
                onChange={(value) => updateField(index, { type: value })}
                options={FIELD_TYPES.map((value) => ({
                  value,
                  label: t(`testCaseTemplates.fieldType_${value}`),
                }))}
              />
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(event) => updateField(index, { required: event.target.checked })}
                />
                {t('testCaseTemplates.fieldRequired')}
              </label>
              <Button
                variant="secondary"
                onClick={() => setFields((current) => current.filter((_, i) => i !== index))}
              >
                {t('testCaseTemplates.removeField')}
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            onClick={() => setFields((current) => [...current, emptyField()])}
          >
            {t('testCaseTemplates.addField')}
          </Button>

          <div className={styles.submitRow}>
            <Button type="submit" disabled={createMutation.isPending}>
              {t('common.create')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
