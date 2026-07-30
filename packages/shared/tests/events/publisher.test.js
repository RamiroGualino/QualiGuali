const logger = require('../../src/utils/logger');
const { createEventPublisher } = require('../../src/events/publisher');

const ORIGINAL_ENV = process.env;

describe('createEventPublisher (no SNS configured — log-only)', () => {
  test('publish() builds a domain event envelope and logs it', async () => {
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
    const { publish } = createEventPublisher('execution-service');

    const event = await publish('ExecutionUpdated', { executionId: 'exec-1', status: 'pass' });

    expect(event.type).toBe('ExecutionUpdated');
    expect(event.source).toBe('execution-service');
    expect(event.payload).toEqual({ executionId: 'exec-1', status: 'pass' });
    expect(event.eventId).toEqual(expect.any(String));
    expect(infoSpy).toHaveBeenCalledWith(
      'Domain event published (no SNS configured, logging only)',
      event,
    );

    infoSpy.mockRestore();
  });

  test('each publish() call gets a unique eventId', async () => {
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    const { publish } = createEventPublisher('execution-service');

    const eventA = await publish('CycleFinished', { cycleId: 'cycle-1' });
    const eventB = await publish('CycleFinished', { cycleId: 'cycle-2' });

    expect(eventA.eventId).not.toBe(eventB.eventId);

    logger.info.mockRestore();
  });
});

describe('createEventPublisher (SNS configured via injected client)', () => {
  function fakeSnsClient() {
    return { send: jest.fn().mockResolvedValue({}) };
  }

  test('publishes to SNS with the event envelope as the message body', async () => {
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    const snsClient = fakeSnsClient();
    const { publish } = createEventPublisher('execution-service', {
      snsClient,
      topicArn: 'arn:aws:sns:us-east-1:000000000000:domain-events',
    });

    const event = await publish('CycleFinished', { cycleId: 'cycle-1' });

    expect(snsClient.send).toHaveBeenCalledTimes(1);
    const command = snsClient.send.mock.calls[0][0];
    expect(command.input.TopicArn).toBe('arn:aws:sns:us-east-1:000000000000:domain-events');
    expect(JSON.parse(command.input.Message)).toEqual(event);

    logger.info.mockRestore();
  });

  test('logs and does not throw when the SNS publish fails', async () => {
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    const snsClient = { send: jest.fn().mockRejectedValue(new Error('network down')) };
    const { publish } = createEventPublisher('execution-service', {
      snsClient,
      topicArn: 'arn:aws:sns:us-east-1:000000000000:domain-events',
    });

    const event = await publish('CycleFinished', { cycleId: 'cycle-1' });

    expect(event.type).toBe('CycleFinished');
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to publish domain event to SNS',
      expect.objectContaining({ error: 'network down' }),
    );

    errorSpy.mockRestore();
    logger.info.mockRestore();
  });
});

describe('createEventPublisher (local HTTP delivery — no SNS, no Docker/LocalStack needed)', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, JWT_SECRET: 'test-secret' };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  test('POSTs the event envelope, as a bearer-authenticated request, to every configured URL', async () => {
    process.env.EVENTS_LOCAL_HTTP_URLS = 'http://localhost:4005, http://localhost:4006';
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true });

    const { publish } = createEventPublisher('execution-service');
    const event = await publish('CycleFinished', { cycleId: 'cycle-1' });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://localhost:4005/internal/events');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toMatch(/^Bearer /);
    expect(JSON.parse(options.body)).toEqual(event);
    expect(fetchSpy.mock.calls[1][0]).toBe('http://localhost:4006/internal/events');
  });

  test('logs but does not throw when a target is unreachable', async () => {
    process.env.EVENTS_LOCAL_HTTP_URLS = 'http://localhost:4005';
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const { publish } = createEventPublisher('execution-service');
    const event = await publish('CycleFinished', { cycleId: 'cycle-1' });

    expect(event.type).toBe('CycleFinished');
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to deliver domain event locally',
      expect.objectContaining({ error: 'ECONNREFUSED' }),
    );
  });
});
