const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const { logger } = require('@qualiguali/shared');
const { processEvent } = require('./processEvent');
const env = require('../config/env');

function buildDefaultSqsClient() {
  const endpoint = env.aws.endpointUrl;
  return new SQSClient({
    region: env.aws.region,
    ...(endpoint && { endpoint, credentials: { accessKeyId: 'test', secretAccessKey: 'test' } }),
  });
}

// The SNS->SQS subscription is created with RawMessageDelivery=true (see
// infra/localstack-init.sh), so a message's Body is exactly the JSON event
// envelope published by createEventPublisher — no SNS wrapper to unwrap.
function createSqsConsumer({ sqsClient, queueUrl } = {}) {
  const client = sqsClient || buildDefaultSqsClient();
  const url = queueUrl || env.aws.queueUrl;
  let running = false;

  async function pollOnce() {
    const { Messages } = await client.send(
      new ReceiveMessageCommand({
        QueueUrl: url,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 10,
      }),
    );

    if (!Messages || Messages.length === 0) return 0;

    // Processed one at a time, not in parallel: some events are causally
    // dependent (e.g. a DefectCreated linked to an execution assumes that
    // execution's ExecutionUpdated was already applied), so preserving
    // batch order is more important than the extra throughput Promise.all
    // would give here.
    for (const message of Messages) {
      try {
        const event = JSON.parse(message.Body);
        await processEvent(event);
        await client.send(
          new DeleteMessageCommand({ QueueUrl: url, ReceiptHandle: message.ReceiptHandle }),
        );
      } catch (err) {
        // Left undeleted on purpose: it becomes visible again after the
        // queue's visibility timeout and gets retried (or moves to a DLQ
        // if one is configured on the queue).
        logger.error('Failed to process SQS message', {
          error: err.message,
          messageId: message.MessageId,
        });
      }
    }

    return Messages.length;
  }

  async function start() {
    running = true;
    logger.info('SQS consumer starting', { queueUrl: url });
    while (running) {
      await pollOnce();
    }
  }

  function stop() {
    running = false;
  }

  return { pollOnce, start, stop };
}

module.exports = { createSqsConsumer };
