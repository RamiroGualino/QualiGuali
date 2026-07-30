// Atomic per-scope, per-prefix sequence generator, shared by every service
// that needs auto-incrementing codes (qa-core-service's REQ-/TC-,
// defects-service's DEF-, ...). Takes the caller's own Counter Mongoose
// model rather than owning one itself — each service keeps its counters in
// its own collection (qacore_counters, defects_counters, ...), consistent
// with the "no cross-service collection access" convention.
//
// findOneAndUpdate($inc) is a single atomic operation on the server, so
// concurrent callers never see the same value. The very first call for a
// given key still upserts; if two callers race to create that first
// document, one of them hits a duplicate-key error on _id — retry once
// without upsert to pick up the now-existing document.
async function nextSequence(CounterModel, scopeId, prefix) {
  const key = `${scopeId}:${prefix}`;
  try {
    const counter = await CounterModel.findOneAndUpdate(
      { _id: key },
      { $inc: { seq: 1 } },
      { returnDocument: 'after', upsert: true },
    );
    return counter.seq;
  } catch (err) {
    if (err.code === 11000) {
      const counter = await CounterModel.findOneAndUpdate(
        { _id: key },
        { $inc: { seq: 1 } },
        { returnDocument: 'after' },
      );
      return counter.seq;
    }
    throw err;
  }
}

async function nextCode(CounterModel, scopeId, prefix, padLength = 3) {
  const seq = await nextSequence(CounterModel, scopeId, prefix);
  return `${prefix}-${String(seq).padStart(padLength, '0')}`;
}

module.exports = { nextSequence, nextCode };
