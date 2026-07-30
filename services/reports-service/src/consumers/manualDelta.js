// A manual Execution can be re-run (pass -> fail -> pass, ...), and each
// re-run publishes a new ExecutionUpdated event. To keep CycleReport's
// counters correct under reprocessing, we don't just increment blindly —
// we subtract whatever the *previous* known status contributed and add
// whatever the *new* status contributes. `isNewExecution` (true the very
// first time we see this executionId) is the only thing that bumps
// totalManual, so the total only ever grows when a genuinely new test is
// registered, not on every re-run.
function computeManualDelta({ prevStatus, newStatus, isNewExecution }) {
  const delta = { totalManual: isNewExecution ? 1 : 0, passedManual: 0, failedManual: 0 };

  if (prevStatus === 'pass') delta.passedManual -= 1;
  if (prevStatus === 'fail') delta.failedManual -= 1;
  if (newStatus === 'pass') delta.passedManual += 1;
  if (newStatus === 'fail') delta.failedManual += 1;

  return delta;
}

module.exports = { computeManualDelta };
