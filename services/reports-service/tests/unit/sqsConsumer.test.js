jest.mock('../../src/consumers/processEvent');

const { processEvent } = require('../../src/consumers/processEvent');
const { createSqsConsumer } = require('../../src/consumers/sqsConsumer');

function fakeMessage(id, event) {
  return { MessageId: id, ReceiptHandle: `receipt-${id}`, Body: JSON.stringify(event) };
}

function fakeSqsClient(responses) {
  let call = 0;
  return {
    // Resolves via setImmediate (a real macrotask) rather than a plain
    // microtask — otherwise a tight `while (running)` loop in start() never
    // yields to the event loop, and the test's `setTimeout` that's supposed
    // to call stop() would never get a chance to fire (busy-loop/OOM).
    send: jest.fn(
      (command) =>
        new Promise((resolve) => {
          setImmediate(() => {
            if (command.constructor.name === 'DeleteMessageCommand') {
              resolve({});
              return;
            }
            const response = responses[Math.min(call, responses.length - 1)] || { Messages: [] };
            call += 1;
            resolve(response);
          });
        }),
    ),
  };
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('createSqsConsumer.pollOnce', () => {
  test('processes every received message and deletes it on success', async () => {
    processEvent.mockResolvedValue({ skipped: false });
    const event = { eventId: 'evt-1', type: 'ExecutionUpdated', payload: {} };
    const sqsClient = fakeSqsClient([{ Messages: [fakeMessage('m1', event)] }]);

    const consumer = createSqsConsumer({ sqsClient, queueUrl: 'http://queue' });
    const count = await consumer.pollOnce();

    expect(count).toBe(1);
    expect(processEvent).toHaveBeenCalledWith(event);
    const deleteCall = sqsClient.send.mock.calls.find(
      (call) => call[0].constructor.name === 'DeleteMessageCommand',
    );
    expect(deleteCall[0].input.ReceiptHandle).toBe('receipt-m1');
  });

  test('returns 0 and does nothing when the queue is empty', async () => {
    const sqsClient = fakeSqsClient([{ Messages: [] }]);
    const consumer = createSqsConsumer({ sqsClient, queueUrl: 'http://queue' });

    const count = await consumer.pollOnce();

    expect(count).toBe(0);
    expect(processEvent).not.toHaveBeenCalled();
  });

  test('does not delete a message whose processing throws (left for retry)', async () => {
    processEvent.mockRejectedValue(new Error('boom'));
    const event = { eventId: 'evt-2', type: 'ExecutionUpdated', payload: {} };
    const sqsClient = fakeSqsClient([{ Messages: [fakeMessage('m2', event)] }]);

    const consumer = createSqsConsumer({ sqsClient, queueUrl: 'http://queue' });
    await consumer.pollOnce();

    const deleteCall = sqsClient.send.mock.calls.find(
      (call) => call[0].constructor.name === 'DeleteMessageCommand',
    );
    expect(deleteCall).toBeUndefined();
  });

  test('processes multiple messages independently — one failing does not block the others', async () => {
    processEvent
      .mockResolvedValueOnce({ skipped: false })
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ skipped: false });
    const events = [
      { eventId: 'evt-a', type: 'ExecutionUpdated', payload: {} },
      { eventId: 'evt-b', type: 'ExecutionUpdated', payload: {} },
      { eventId: 'evt-c', type: 'ExecutionUpdated', payload: {} },
    ];
    const sqsClient = fakeSqsClient([
      {
        Messages: [
          fakeMessage('a', events[0]),
          fakeMessage('b', events[1]),
          fakeMessage('c', events[2]),
        ],
      },
    ]);

    const consumer = createSqsConsumer({ sqsClient, queueUrl: 'http://queue' });
    const count = await consumer.pollOnce();

    expect(count).toBe(3);
    expect(processEvent).toHaveBeenCalledTimes(3);
    const deleteCalls = sqsClient.send.mock.calls.filter(
      (call) => call[0].constructor.name === 'DeleteMessageCommand',
    );
    expect(deleteCalls).toHaveLength(2);
  });
});

describe('createSqsConsumer.start/stop', () => {
  test('stop() ends the polling loop', async () => {
    processEvent.mockResolvedValue({ skipped: false });
    const sqsClient = fakeSqsClient([{ Messages: [] }, { Messages: [] }, { Messages: [] }]);
    const consumer = createSqsConsumer({ sqsClient, queueUrl: 'http://queue' });

    const runPromise = consumer.start();
    // Let a couple of poll cycles happen, then stop.
    await new Promise((resolve) => setTimeout(resolve, 10));
    consumer.stop();
    await runPromise;

    expect(sqsClient.send).toHaveBeenCalled();
  });
});
