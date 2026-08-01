// Etapa 8 (docs/postman-runner/etapa-8-historial-y-auditoria.md): a pure
// diff between two runs' testResults, keyed off which test each result
// actually is, not the order either list happens to be in — a run can add,
// remove, or reorder requests between executions (a new collection version,
// see etapa-4/etapa-6's collectionVersion), so array-index comparison isn't
// safe.
//
// Matched by `${suiteName}::${testName}`, not testName alone: the etapa
// doc's own wording says "comparar... por testName", but a real Postman
// collection can have the same request name inside two different folders
// (Newman surfaces each folder as its own "suite" per parseNewmanReport) —
// suiteName is already available on every testResult and costs nothing to
// include, so two same-named requests in different suites don't collapse
// into one diff row.
function keyFor(testResult) {
  return `${testResult.suiteName || ''}::${testResult.testName}`;
}

const FAILING_STATUSES = new Set(['failed', 'broken']);

// One run's testResults[] in, one row per test that appears in either run:
// - present only in B → isNew
// - present only in A → isRemoved
// - present in both, A passed and B failed/broken → regression
// - present in both, A failed/broken and B passed → fixed
// - anything else present in both → neither (statusA/statusB just reported)
function compareRuns(testResultsA = [], testResultsB = []) {
  const byKeyA = new Map(testResultsA.map((t) => [keyFor(t), t]));
  const byKeyB = new Map(testResultsB.map((t) => [keyFor(t), t]));
  const allKeys = new Set([...byKeyA.keys(), ...byKeyB.keys()]);

  return [...allKeys].map((key) => {
    const a = byKeyA.get(key);
    const b = byKeyB.get(key);
    const statusA = a ? a.status : null;
    const statusB = b ? b.status : null;
    const isNew = !a && Boolean(b);
    const isRemoved = Boolean(a) && !b;
    const regression =
      Boolean(a) && Boolean(b) && statusA === 'passed' && FAILING_STATUSES.has(statusB);
    const fixed = Boolean(a) && Boolean(b) && FAILING_STATUSES.has(statusA) && statusB === 'passed';

    return {
      suiteName: (b || a).suiteName || null,
      testName: (b || a).testName,
      statusA,
      statusB,
      isNew,
      isRemoved,
      regression,
      fixed,
    };
  });
}

module.exports = { compareRuns };
