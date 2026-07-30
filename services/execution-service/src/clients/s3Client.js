const {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  PutBucketPolicyCommand,
} = require('@aws-sdk/client-s3');
const env = require('../config/env');

const client = new S3Client({
  region: env.s3.region,
  endpoint: env.s3.endpoint,
  forcePathStyle: env.s3.forcePathStyle,
  credentials: {
    accessKeyId: env.s3.accessKeyId,
    secretAccessKey: env.s3.secretAccessKey,
  },
});

// MinIO doesn't auto-create buckets — make sure ours exists on startup
// instead of requiring a separate `mc` init container in docker-compose.
async function ensureBucket() {
  try {
    await client.send(new HeadBucketCommand({ Bucket: env.s3.bucket }));
  } catch (err) {
    const status = err.$metadata?.httpStatusCode;
    if (status === 404 || err.name === 'NotFound') {
      await client.send(new CreateBucketCommand({ Bucket: env.s3.bucket }));
    } else {
      throw err;
    }
  }
  await ensurePublicReadPolicy();
}

// uploadObject hands back a plain, unsigned fileUrl that the frontend embeds
// directly (<img>, <a>, <video>) — that only resolves if the bucket allows
// anonymous GetObject, which MinIO doesn't grant by default. Without this,
// every evidence file 403s.
async function ensurePublicReadPolicy() {
  const policy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: '*',
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${env.s3.bucket}/*`],
      },
    ],
  };
  await client.send(
    new PutBucketPolicyCommand({ Bucket: env.s3.bucket, Policy: JSON.stringify(policy) }),
  );
}

async function uploadObject(key, body, contentType) {
  await client.send(
    new PutObjectCommand({
      Bucket: env.s3.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  const base = env.s3.publicUrlBase || env.s3.endpoint;
  return `${base}/${env.s3.bucket}/${key}`;
}

module.exports = { ensureBucket, uploadObject };
