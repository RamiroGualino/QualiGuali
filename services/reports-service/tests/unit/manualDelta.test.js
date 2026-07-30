const { computeManualDelta } = require('../../src/consumers/manualDelta');

describe('computeManualDelta', () => {
  test('a brand-new execution registering pass increments total and passed', () => {
    const delta = computeManualDelta({ prevStatus: null, newStatus: 'pass', isNewExecution: true });
    expect(delta).toEqual({ totalManual: 1, passedManual: 1, failedManual: 0 });
  });

  test('a brand-new execution registering fail increments total and failed', () => {
    const delta = computeManualDelta({ prevStatus: null, newStatus: 'fail', isNewExecution: true });
    expect(delta).toEqual({ totalManual: 1, passedManual: 0, failedManual: 1 });
  });

  test('a brand-new execution registering blocked only increments total', () => {
    const delta = computeManualDelta({
      prevStatus: null,
      newStatus: 'blocked',
      isNewExecution: true,
    });
    expect(delta).toEqual({ totalManual: 1, passedManual: 0, failedManual: 0 });
  });

  test('re-running pass -> fail does not touch total, moves the counters', () => {
    const delta = computeManualDelta({
      prevStatus: 'pass',
      newStatus: 'fail',
      isNewExecution: false,
    });
    expect(delta).toEqual({ totalManual: 0, passedManual: -1, failedManual: 1 });
  });

  test('re-running fail -> pass does not touch total, moves the counters', () => {
    const delta = computeManualDelta({
      prevStatus: 'fail',
      newStatus: 'pass',
      isNewExecution: false,
    });
    expect(delta).toEqual({ totalManual: 0, passedManual: 1, failedManual: -1 });
  });

  test('re-running pass -> blocked drops it out of passed without adding elsewhere', () => {
    const delta = computeManualDelta({
      prevStatus: 'pass',
      newStatus: 'blocked',
      isNewExecution: false,
    });
    expect(delta).toEqual({ totalManual: 0, passedManual: -1, failedManual: 0 });
  });

  test('re-running the same status twice nets to a zero delta', () => {
    const delta = computeManualDelta({
      prevStatus: 'pass',
      newStatus: 'pass',
      isNewExecution: false,
    });
    expect(delta).toEqual({ totalManual: 0, passedManual: 0, failedManual: 0 });
  });
});
