import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { dataTestingApi } from '../api/dataTesting.api';
import { PageHeader } from '../components/PageHeader';
import { BackButton } from '../components/BackButton';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { Combobox } from '../components/Combobox';
import { Dropzone } from '../components/Dropzone';
import { ExpectationSelector } from '../components/ExpectationSelector';
import { ExpectationList } from '../components/ExpectationList';
import { LoadingState, ErrorState } from '../components/QueryStates';
import styles from './ExpectationSuiteFormPage.module.css';

// Etapa 6 (docs/data-testing/etapa-6-frontend-suites.md), rediseñado en la
// Etapa 6.1 (docs/data-testing/etapa-6.1-Rediseño UX.md): crear/editar una
// Suite de Expectativas. `id` ausente (ruta .../suites/new) = modo
// creación; `id` presente (ruta .../suites/:id) = modo edición.
//
// El fetch + el formulario están separados a propósito: `key={id || 'new'}`
// hace que SuiteFormContent remonte de cero (en vez de re-hidratar estado
// vía useEffect, que el lint del repo rechaza — "Calling setState
// synchronously within an effect can trigger cascading renders") cada vez
// que cambia a qué Suite apunta la ruta, con `initialSuite` ya resuelto.
export function ExpectationSuiteFormPage() {
  const { id } = useParams();
  const isEditMode = Boolean(id);

  const suiteQuery = useQuery({
    queryKey: ['expectationSuite', id],
    queryFn: () => dataTestingApi.getSuite(id),
    enabled: isEditMode,
  });

  if (isEditMode && suiteQuery.isLoading) return <LoadingState />;
  if (isEditMode && suiteQuery.isError) return <ErrorState onRetry={suiteQuery.refetch} />;

  return (
    <SuiteFormContent
      key={id || 'new'}
      isEditMode={isEditMode}
      initialSuite={suiteQuery.data?.expectationSuite}
    />
  );
}

function countForColumn(expectations, columnName) {
  return expectations.filter(
    (e) =>
      (e.scope === 'column' && e.column === columnName) ||
      (e.scope === 'multicolumn' && e.columns?.includes(columnName)),
  ).length;
}

function SuiteFormContent({ isEditMode, initialSuite }) {
  const { t } = useTranslation();
  const { projectId, id } = useParams();
  const navigate = useNavigate();

  const [name, setName] = useState(initialSuite?.name || '');
  const [description, setDescription] = useState(initialSuite?.description || '');
  // Etapa 6.1 §1: colapsada por default salvo que ya tenga contenido (modo
  // edición) — una vez expandida en esta sesión, se queda expandida (no
  // hace falta poder volver a colapsarla).
  const [descriptionExpanded, setDescriptionExpanded] = useState(Boolean(initialSuite?.description));
  const [availableColumns, setAvailableColumns] = useState(initialSuite?.expectedColumns || []);
  const [referenceRowCount, setReferenceRowCount] = useState(null);
  // Nombre del archivo recién subido EN ESTA SESIÓN — null en modo edición
  // hasta que se vuelva a subir uno (no hay forma de recuperar el nombre
  // del archivo original, la Suite sólo guarda las columnas ya detectadas).
  const [referenceFileName, setReferenceFileName] = useState(null);
  const [showDropzone, setShowDropzone] = useState(availableColumns.length === 0);
  const [businessIdColumn, setBusinessIdColumn] = useState(initialSuite?.businessIdColumn || '');
  const [businessIdSearch, setBusinessIdSearch] = useState(initialSuite?.businessIdColumn || '');
  const [expectations, setExpectations] = useState(initialSuite?.expectations || []);
  const [sampleLimit, setSampleLimit] = useState(String(initialSuite?.sampleLimit || 20));
  const [saveError, setSaveError] = useState('');

  // Estado del panel de alta/edición (ExpectationSelector) — ver el propio
  // comentario del componente: `resetToken` fuerza un remount completo
  // (key) cada vez que se lo quiere re-sembrar desde afuera (pastilla de
  // columna tocada, "Editar", "Cancelar"), en vez de reaccionar a props
  // nuevas vía efecto.
  const [editingIndex, setEditingIndex] = useState(null);
  const [pendingJumpColumn, setPendingJumpColumn] = useState('');
  const [resetToken, setResetToken] = useState(0);
  // Pestaña activa del panel de alta — controlada acá (no interna al
  // panel) porque ExpectationList (al lado) también la necesita, para
  // listar sólo las expectativas de ese mismo scope.
  const [activeTab, setActiveTab] = useState('table');
  const editingExpectation = editingIndex !== null ? expectations[editingIndex] : null;

  const detectColumnsMutation = useMutation({
    mutationFn: (file) => dataTestingApi.detectColumns(file),
    onSuccess: (data) => {
      // Etapa 6.2: expectedColumns pasó de [String] a [{name, tipoDato}] —
      // sólo agrega los headers genuinely nuevos (por nombre); los que ya
      // estaban conservan el tipoDato que el usuario ya les haya asignado.
      setAvailableColumns((current) => {
        const existingNames = new Set(current.map((column) => column.name));
        const additions = data.headers
          .filter((name) => !existingNames.has(name))
          .map((name) => ({ name, tipoDato: 'sin_definir' }));
        return [...current, ...additions];
      });
      setReferenceRowCount(data.rowCount ?? null);
      setShowDropzone(false);
    },
  });

  const createMutation = useMutation({
    mutationFn: () =>
      dataTestingApi.createSuite({
        projectId,
        name,
        description,
        sampleLimit: Number(sampleLimit) || 20,
        businessIdColumn: businessIdColumn || undefined,
        expectedColumns: availableColumns,
        expectations,
      }),
    onSuccess: () => navigate(`/projects/${projectId}/data-testing/suites`),
    onError: (error) => setSaveError(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      dataTestingApi.updateSuite(id, {
        name,
        description,
        sampleLimit: Number(sampleLimit) || 20,
        businessIdColumn: businessIdColumn || null,
        expectedColumns: availableColumns,
        expectations,
      }),
    onSuccess: () => navigate(`/projects/${projectId}/data-testing/suites`),
    onError: (error) => setSaveError(error.message),
  });

  const saveMutation = isEditMode ? updateMutation : createMutation;

  function handleReferenceFile(file) {
    setReferenceFileName(file.name);
    detectColumnsMutation.mutate(file);
  }

  function handleBusinessIdSearchChange(text) {
    setBusinessIdSearch(text);
    setBusinessIdColumn(availableColumns.some((column) => column.name === text) ? text : '');
  }

  function handleColumnTypeChange(columnName, tipoDato) {
    setAvailableColumns((current) =>
      current.map((column) => (column.name === columnName ? { ...column, tipoDato } : column)),
    );
  }

  // Click en una pastilla de "Columnas detectadas" (§2/§3): salta a la
  // pestaña Columna del panel de alta con esa columna ya elegida.
  function handlePillClick(column) {
    setEditingIndex(null);
    setPendingJumpColumn(column);
    setActiveTab('column');
    setResetToken((current) => current + 1);
  }

  function handleEditExpectation(index) {
    setPendingJumpColumn('');
    setEditingIndex(index);
    setActiveTab(expectations[index].scope);
    setResetToken((current) => current + 1);
  }

  function handleCancelEdit() {
    setEditingIndex(null);
    setPendingJumpColumn('');
    setResetToken((current) => current + 1);
  }

  function handleRemoveExpectation(index) {
    setExpectations((current) => current.filter((_, i) => i !== index));
    if (editingIndex === index) handleCancelEdit();
  }

  // Alta: se agrega al final, el panel de alta se queda como está (mismo
  // tab/columna) — ver ExpectationSelector.handleSubmit. Edición: reemplaza
  // en su lugar y vuelve a modo alta, en la misma columna si la
  // expectativa editada era de scope 'column' (probablemente se sigue
  // trabajando en esa misma columna).
  function handleSubmitExpectation(expectation) {
    if (editingIndex !== null) {
      const editedColumn = expectation.scope === 'column' ? expectation.column : '';
      setExpectations((current) =>
        current.map((entry, i) => (i === editingIndex ? expectation : entry)),
      );
      setEditingIndex(null);
      setPendingJumpColumn(editedColumn);
      setActiveTab(expectation.scope);
      setResetToken((current) => current + 1);
    } else {
      setExpectations((current) => [...current, expectation]);
    }
  }

  const canSave = Boolean(name) && expectations.length > 0 && !saveMutation.isPending;

  const selectorSeed = editingExpectation
    ? {
        column: editingExpectation.column || '',
        columns: editingExpectation.columns || [],
        expectation: editingExpectation,
      }
    : {
        column: pendingJumpColumn,
        columns: [],
        expectation: null,
      };

  return (
    <div>
      <PageHeader
        title={t(isEditMode ? 'dataTesting.editTitle' : 'dataTesting.createTitle')}
        leading={<BackButton />}
      />

      <Card>
        <div className={styles.metaRow}>
          <div className={styles.nameField}>
            <TextField label={t('dataTesting.name')} value={name} onChange={setName} required />
          </div>
          {!descriptionExpanded && (
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => setDescriptionExpanded(true)}
            >
              {description ? description : t('dataTesting.addDescriptionLink')}
            </button>
          )}
        </div>
        {descriptionExpanded && (
          <TextField
            label={t('dataTesting.description')}
            value={description}
            onChange={setDescription}
            as="textarea"
          />
        )}

        <p className={styles.fieldLabel}>{t('dataTesting.referenceFile')}</p>
        {showDropzone ? (
          <>
            <Dropzone
              compact
              accept="application/json,.xlsx,.xls,.csv,.ods"
              hint={t('dataTesting.referenceFileHint')}
              onFiles={(files) => handleReferenceFile(files[0])}
            />
            {availableColumns.length === 0 && (
              <p className={styles.hint}>{t('dataTesting.noColumnsYet')}</p>
            )}
          </>
        ) : (
          <div className={styles.fileBar}>
            <span>
              📄{' '}
              {referenceFileName
                ? `${referenceFileName} · ${t('dataTesting.columnsDetectedCount', { count: availableColumns.length })}`
                : t('dataTesting.columnsDetectedSoFar', { count: availableColumns.length })}
            </span>
            <Button variant="secondary" size="sm" onClick={() => setShowDropzone(true)}>
              {t(referenceFileName ? 'dataTesting.changeFileButton' : 'dataTesting.updateFileButton')}
            </Button>
          </div>
        )}

        <div className={styles.row}>
          <Combobox
            label={t('dataTesting.businessIdColumn')}
            value={businessIdSearch}
            onChange={handleBusinessIdSearchChange}
            placeholder={t('dataTesting.businessIdColumnPlaceholder')}
            options={availableColumns.map((column) => ({ value: column.name, label: column.name }))}
          />
          <TextField
            label={t('dataTesting.sampleLimit')}
            type="number"
            min="1"
            max="100"
            value={sampleLimit}
            onChange={setSampleLimit}
          />
        </div>

        {availableColumns.length > 0 && (
          <div>
            <p className={styles.fieldLabel}>{t('dataTesting.detectedColumns')}</p>
            <ul className={styles.pillList} role="list" aria-label={t('dataTesting.detectedColumns')}>
              {availableColumns.map((column) => {
                const count = countForColumn(expectations, column.name);
                return (
                  <li key={column.name} role="listitem">
                    <button
                      type="button"
                      className={styles.columnPill}
                      onClick={() => handlePillClick(column.name)}
                    >
                      {count > 0 ? `${column.name} (${count})` : column.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Card>

      <div className={styles.workArea}>
        <div className={styles.leftPanel}>
          <ExpectationSelector
            key={resetToken}
            columns={availableColumns}
            rowCount={referenceRowCount}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onColumnTypeChange={handleColumnTypeChange}
            initialColumn={selectorSeed.column}
            initialColumns={selectorSeed.columns}
            initialExpectation={selectorSeed.expectation}
            isEditing={editingIndex !== null}
            onSubmit={handleSubmitExpectation}
            onCancelEdit={handleCancelEdit}
          />
        </div>
        <div className={styles.rightPanel}>
          <p className={styles.fieldLabel}>
            {t('dataTesting.expectationsConfiguredTitle', { count: expectations.length })}
          </p>
          <ExpectationList
            expectations={expectations}
            scope={activeTab}
            editingIndex={editingIndex}
            onEdit={handleEditExpectation}
            onRemove={handleRemoveExpectation}
          />
        </div>
      </div>

      {saveError && <p className={styles.error}>{saveError}</p>}
      <div className={styles.saveBar}>
        <Button disabled={!canSave} onClick={() => saveMutation.mutate()}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
