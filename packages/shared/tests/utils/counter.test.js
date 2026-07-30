const { nextSequence, nextCode } = require('../../src/utils/counter');

// A minimal fake standing in for a Mongoose model, so this stays a pure
// unit test — real atomicity under concurrent processes is exercised by the
// consuming services' own integration tests against mongodb-memory-server.
function createFakeCounterModel() {
  const store = new Map();
  return {
    async findOneAndUpdate(filter, update, options) {
      const key = filter._id;
      if (!store.has(key)) {
        if (!options.upsert) return null;
        store.set(key, { seq: 0 });
      }
      const doc = store.get(key);
      doc.seq += update.$inc.seq;
      return doc;
    },
  };
}

describe('nextSequence', () => {
  test('increments sequentially for the same scope+prefix', async () => {
    const CounterModel = createFakeCounterModel();

    expect(await nextSequence(CounterModel, 'project-1', 'DEF')).toBe(1);
    expect(await nextSequence(CounterModel, 'project-1', 'DEF')).toBe(2);
    expect(await nextSequence(CounterModel, 'project-1', 'DEF')).toBe(3);
  });

  test('keeps independent counters per scope and per prefix', async () => {
    const CounterModel = createFakeCounterModel();

    expect(await nextSequence(CounterModel, 'project-1', 'DEF')).toBe(1);
    expect(await nextSequence(CounterModel, 'project-1', 'REQ')).toBe(1);
    expect(await nextSequence(CounterModel, 'project-2', 'DEF')).toBe(1);
  });

  test('retries once when the initial upsert loses a creation race (11000)', async () => {
    let callCount = 0;
    const CounterModel = {
      findOneAndUpdate: jest.fn(async (_filter, _update, options) => {
        callCount += 1;
        if (options.upsert && callCount === 1) {
          const err = new Error('duplicate key');
          err.code = 11000;
          throw err;
        }
        return { seq: 5 };
      }),
    };

    const seq = await nextSequence(CounterModel, 'project-1', 'DEF');
    expect(seq).toBe(5);
    expect(CounterModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  test('propagates an unrelated error', async () => {
    const CounterModel = {
      findOneAndUpdate: jest.fn().mockRejectedValue(new Error('connection lost')),
    };

    await expect(nextSequence(CounterModel, 'project-1', 'DEF')).rejects.toThrow('connection lost');
  });
});

describe('nextCode', () => {
  test('formats a zero-padded code with the given prefix', async () => {
    const CounterModel = createFakeCounterModel();

    expect(await nextCode(CounterModel, 'project-1', 'DEF')).toBe('DEF-001');
    expect(await nextCode(CounterModel, 'project-1', 'DEF')).toBe('DEF-002');
  });

  test('supports a custom padding length', async () => {
    const CounterModel = createFakeCounterModel();
    expect(await nextCode(CounterModel, 'project-1', 'DEF', 4)).toBe('DEF-0001');
  });
});
