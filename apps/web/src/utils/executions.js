// Shared by every screen that lists an execution cycle's test cases
// (ExecutionCycleDetailPage, ReportsDashboardPage): the 4 statuses an
// Execution can be in, and how to sort by a "TC-<number>" code.

// Test case codes are always "TC-<number>" — sort by that number (not the
// string) so TC-9 comes before TC-10. Unresolved executions (no matching
// test case) sort last rather than breaking the order.
export function codeNumber(code) {
  const match = /(\d+)$/.exec(code || '');
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

// The identifier a tester actually sees for a case: its own imported
// Test Case ID when it has one, plain title otherwise. The app's internal
// `code` (TC-006, ...) still exists — it's what codeNumber() above sorts
// by, and Mongo still needs a unique key — but it's never shown; testers
// recognize their own source ID, not one we made up for them.
export function formatCaseLabel(testCaseId, title) {
  return testCaseId ? `${testCaseId}: ${title}` : title;
}

export function countsFor(executions) {
  return {
    pass: executions.filter((execution) => execution.status === 'pass').length,
    fail: executions.filter((execution) => execution.status === 'fail').length,
    blocked: executions.filter((execution) => execution.status === 'blocked').length,
    notExecuted: executions.filter((execution) => execution.status === 'not_executed').length,
  };
}
