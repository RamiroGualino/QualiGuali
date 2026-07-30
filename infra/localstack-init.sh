#!/bin/bash
# Runs automatically once LocalStack is ready (mounted at
# /etc/localstack/init/ready.d/ — see docker-compose.yml). Creates the single
# SNS topic every service publishes domain events to, plus the SQS queue
# reports-service consumes from, and subscribes the queue to the topic with
# raw message delivery (so the SQS message body is exactly our event JSON,
# no SNS envelope to unwrap).
set -e

TOPIC_NAME="domain-events"
QUEUE_NAME="reports-service-domain-events"

awslocal sns create-topic --name "$TOPIC_NAME"
awslocal sqs create-queue --queue-name "$QUEUE_NAME"

TOPIC_ARN=$(awslocal sns list-topics --query "Topics[?ends_with(TopicArn, ':${TOPIC_NAME}')].TopicArn" --output text)
QUEUE_URL=$(awslocal sqs get-queue-url --queue-name "$QUEUE_NAME" --query QueueUrl --output text)
QUEUE_ARN=$(awslocal sqs get-queue-attributes --queue-url "$QUEUE_URL" --attribute-names QueueArn --query Attributes.QueueArn --output text)

awslocal sns subscribe \
  --topic-arn "$TOPIC_ARN" \
  --protocol sqs \
  --notification-endpoint "$QUEUE_ARN" \
  --attributes RawMessageDelivery=true

echo "LocalStack ready: topic=$TOPIC_ARN queue=$QUEUE_URL"
