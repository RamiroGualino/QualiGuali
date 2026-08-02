import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { dataTestingApi } from '../api/dataTesting.api';
import { Combobox } from './Combobox';
import { Dropzone } from './Dropzone';
import { Select } from './Select';
import { Button } from './Button';
import { StatusBadge } from './StatusBadge';
import { LoadingState, ErrorState } from './QueryStates';
import styles from './ValidationRunNewModal.module.css';

const UNSET = '__unset__';
const NOT_IN_FILE = '__missing__';

// Etapa 7 (docs/data-testing/etapa-7-frontend-corridas.md): contenido de un
// Modal (no una página propia, mismo criterio que PostmanTestDrawerContent)
// — wizard de 2 pasos para lanzar una Corrida de Validación (REQ-DT-008/009).
//
// `previewMatch` se dispara desde los propios handlers de Combobox/Dropzone
// (no desde un useEffect, que el lint del repo rechaza) — cualquiera de los
// dos, Suite elegida o archivo subido, dispara el preview en cuanto ambos
// datos están disponibles.
export function ValidationRunNewModal({ suites = [], onCreated = () => {}, onCancel = () => {} }) {
  const { t } = useTranslation();

  const [suiteId, setSuiteId] = useState('');
  const [suiteSearch, setSuiteSearch] = useState('');
  const [file, setFile] = useState(null);
  const [mapping, setMapping] = useState([]);
  const [headers, setHeaders] = useState([]);
  // expectedColumn -> matchedColumn|null — solo las correcciones manuales
  // que el usuario hizo a mano sobre una entrada 'not_found'.
  const [manualAssignments, setManualAssignments] = useState({});
  const [confirmedFuzzy, setConfirmedFuzzy] = useState(new Set());
  const [saveMappingToSuite, setSaveMappingToSuite] = useState(false);
  const [runError, setRunError] = useState('');

  const previewMutation = useMutation({
    mutationFn: ({ suiteId: forSuiteId, file: forFile }) =>
      dataTestingApi.previewMatch(forSuiteId, forFile),
    onSuccess: (data) => {
      setMapping(data.matches);
      setHeaders(data.headers);
      setManualAssignments({});
      setConfirmedFuzzy(new Set());
    },
  });

  function runPreview(nextSuiteId, nextFile) {
    if (nextSuiteId && nextFile) {
      previewMutation.mutate({ suiteId: nextSuiteId, file: nextFile });
    }
  }

  function handleSuiteSearchChange(text) {
    setSuiteSearch(text);
    const matched = suites.find((suite) => suite.name === text);
    const nextSuiteId = matched ? matched._id : '';
    setSuiteId(nextSuiteId);
    runPreview(nextSuiteId, file);
  }

  function handleFiles(fileList) {
    const nextFile = fileList[0];
    setFile(nextFile);
    runPreview(suiteId, nextFile);
  }

  function resolveNotFound(expectedColumn, value) {
    if (value === UNSET) return;
    setManualAssignments((current) => ({
      ...current,
      [expectedColumn]: value === NOT_IN_FILE ? null : value,
    }));
  }

  function confirmFuzzy(expectedColumn) {
    setConfirmedFuzzy((current) => new Set(current).add(expectedColumn));
  }

  const unresolvedNotFound = mapping.filter(
    (match) => match.matchType === 'not_found' && !(match.expectedColumn in manualAssignments),
  );

  const createRunMutation = useMutation({
    mutationFn: () => {
      const columnMappingOverrides = Object.entries(manualAssignments).map(
        ([expectedColumn, matchedColumn]) => ({ expectedColumn, matchedColumn }),
      );
      return dataTestingApi.createRun({
        suiteId,
        file,
        columnMappingOverrides: columnMappingOverrides.length ? columnMappingOverrides : undefined,
        saveMappingToSuite,
      });
    },
    onSuccess: () => onCreated(),
    onError: (error) => setRunError(error.message),
  });

  const canRun =
    Boolean(suiteId) &&
    Boolean(file) &&
    mapping.length > 0 &&
    unresolvedNotFound.length === 0 &&
    !createRunMutation.isPending;

  function statusFor(match) {
    if (match.matchType === 'exact') {
      return { status: 'passed', label: t('dataTesting.matchExact') };
    }
    if (match.matchType === 'fuzzy') {
      return confirmedFuzzy.has(match.expectedColumn)
        ? { status: 'passed', label: t('dataTesting.matchFuzzy') }
        : { status: 'in_progress', label: t('dataTesting.matchFuzzy') };
    }
    // not_found
    if (match.expectedColumn in manualAssignments) {
      return manualAssignments[match.expectedColumn]
        ? { status: 'passed', label: t('dataTesting.matchManual') }
        : { status: 'neutral', label: t('dataTesting.notInFile') };
    }
    return { status: 'failed', label: t('dataTesting.matchNotFound') };
  }

  return (
    <div>
      <Combobox
        label={t('dataTesting.selectSuite')}
        value={suiteSearch}
        onChange={handleSuiteSearchChange}
        required
        placeholder={t('dataTesting.selectSuitePlaceholder')}
        options={suites.map((suite) => ({ value: suite._id, label: suite.name }))}
      />

      <p className={styles.fieldLabel}>{t('dataTesting.fileToValidate')}</p>
      <Dropzone compact hint={t('dataTesting.fileToValidateHint')} onFiles={handleFiles} />
      {file && <p className={styles.fileName}>{file.name}</p>}

      {previewMutation.isPending && <LoadingState />}
      {previewMutation.isError && (
        <ErrorState
          message={previewMutation.error?.message}
          onRetry={() => runPreview(suiteId, file)}
        />
      )}

      {mapping.length > 0 && (
        <div>
          <p className={styles.fieldLabel}>{t('dataTesting.columnMappingTitle')}</p>
          <ul className={styles.mappingList} role="list" aria-label={t('dataTesting.columnMappingTitle')}>
            {mapping.map((match) => {
              const { status, label } = statusFor(match);
              return (
                <li
                  key={match.expectedColumn}
                  role="listitem"
                  aria-label={match.expectedColumn}
                  className={styles.mappingRow}
                >
                  <span className={styles.expectedColumn}>{match.expectedColumn}</span>
                  <span className={styles.matchedColumn}>{match.matchedColumn || '—'}</span>
                  <StatusBadge status={status} label={label} />
                  {match.matchType === 'fuzzy' && !confirmedFuzzy.has(match.expectedColumn) && (
                    <Button size="sm" variant="secondary" onClick={() => confirmFuzzy(match.expectedColumn)}>
                      {t('dataTesting.confirmMatch')}
                    </Button>
                  )}
                  {match.matchType === 'not_found' && (
                    <Select
                      label=""
                      value={
                        !(match.expectedColumn in manualAssignments)
                          ? UNSET
                          : manualAssignments[match.expectedColumn] || NOT_IN_FILE
                      }
                      onChange={(value) => resolveNotFound(match.expectedColumn, value)}
                      options={[
                        { value: UNSET, label: t('dataTesting.assignColumnPlaceholder') },
                        { value: NOT_IN_FILE, label: t('dataTesting.notInFile') },
                        ...headers.map((header) => ({ value: header, label: header })),
                      ]}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {mapping.length > 0 && (
        <label className={styles.saveMappingCheckbox}>
          <input
            type="checkbox"
            checked={saveMappingToSuite}
            onChange={(event) => setSaveMappingToSuite(event.target.checked)}
          />
          {t('dataTesting.saveMappingCheckbox')}
        </label>
      )}

      {runError && <p className={styles.error}>{runError}</p>}

      <div className={styles.actions}>
        <Button variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button disabled={!canRun} onClick={() => createRunMutation.mutate()}>
          {t('dataTesting.runButton')}
        </Button>
      </div>
    </div>
  );
}
