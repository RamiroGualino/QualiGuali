const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { createDomainEvent } = require('./baseEvent');

function buildDefaultSnsClient() {
  const endpoint = process.env.AWS_ENDPOINT_URL;
  return new SNSClient({
    region: process.env.AWS_REGION || 'us-east-1',
    // LocalStack (local dev) needs an explicit endpoint + dummy credentials;
    // real AWS picks up region/credentials from the environment as usual.
    ...(endpoint && { endpoint, credentials: { accessKeyId: 'test', secretAccessKey: 'test' } }),
  });
}

// Mints the same kind of short-lived, self-issued token reports-service
// already uses for its own outbound calls (see reports-service's
// issueServiceToken) — every service shares JWT_SECRET, so any of them can
// mint one a consumer's createAuthenticate middleware will accept.
function issueLocalDeliveryToken(source) {
  return jwt.sign({ userId: `system:${source}`, role: 'super_admin' }, process.env.JWT_SECRET, {
    expiresIn: '5m',
  });
}

// Publishes to a real SNS topic when SNS_TOPIC_ARN is configured (LocalStack
// in local dev, a real topic in AWS). Otherwise, if EVENTS_LOCAL_HTTP_URLS
// is set (comma-separated base URLs), delivers the event by POSTing it
// directly to each listener's /internal/events — a dependency-free stand-in
// for the SNS->SQS fan-out that needs no LocalStack/Docker at all. With
// neither configured, falls back to logging only, so services/tests that
// never configure either keep working exactly as before (Partes 3-5).
function createEventPublisher(source, { snsClient, topicArn } = {}) {
  const resolvedTopicArn = topicArn || process.env.SNS_TOPIC_ARN;
  const client = resolvedTopicArn ? snsClient || buildDefaultSnsClient() : null;
  const localDeliveryUrls = (process.env.EVENTS_LOCAL_HTTP_URLS || '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);

  async function deliverLocally(event) {
    const token = issueLocalDeliveryToken(source);
    await Promise.all(
      localDeliveryUrls.map(async (baseUrl) => {
        try {
          const response = await fetch(`${baseUrl}/internal/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(event),
          });
          if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText}`);
          }
        } catch (err) {
          logger.error('Failed to deliver domain event locally', {
            type: event.type,
            eventId: event.eventId,
            baseUrl,
            error: err.message,
          });
        }
      }),
    );
  }

  async function publish(type, payload) {
    const event = createDomainEvent({ type, source, payload });

    if (client && resolvedTopicArn) {
      try {
        await client.send(
          new PublishCommand({ TopicArn: resolvedTopicArn, Message: JSON.stringify(event) }),
        );
        logger.info('Domain event published to SNS', {
          type: event.type,
          eventId: event.eventId,
          topicArn: resolvedTopicArn,
        });
      } catch (err) {
        logger.error('Failed to publish domain event to SNS', {
          type: event.type,
          eventId: event.eventId,
          error: err.message,
        });
      }
      return event;
    }

    if (localDeliveryUrls.length > 0) {
      await deliverLocally(event);
      logger.info('Domain event delivered locally (no SNS configured)', event);
      return event;
    }

    logger.info('Domain event published (no SNS configured, logging only)', event);
    return event;
  }

  return { publish };
}

module.exports = { createEventPublisher };
