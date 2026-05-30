// Thin wrapper around @aws-sdk/client-s3 pointed at Cloudflare R2.
// Required env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.
// Optional env: R2_BUCKET (default "bfe-content").
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { Agent } from 'node:https';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

export const BUCKET = process.env.R2_BUCKET || 'bfe-content';

export function r2Client() {
  const accountId = requireEnv('R2_ACCOUNT_ID');
  const accessKeyId = requireEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY');

  // Two R2 compatibility quirks rolled into one config:
  // 1. `forcePathStyle: true` — R2's per-bucket virtual-hosted-style URL
  //    (`<bucket>.<account>.r2.cloudflarestorage.com`) often has no working
  //    TLS cert for newly-provisioned accounts. Path-style hits the
  //    account-level hostname only.
  // 2. Custom HTTPS agent capped at TLS 1.2 — R2's per-account hostname
  //    sometimes fails TLS 1.3 SNI negotiation (Cloudflare quirk). TLS 1.2
  //    works reliably; the connection is still encrypted and authenticated.
  const httpsAgent = new Agent({
    maxVersion: 'TLSv1.2',
    minVersion: 'TLSv1.2',
    keepAlive: true,
  });

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
    requestHandler: new NodeHttpHandler({ httpsAgent }),
  });
}

export async function listKeys(client, prefix = '') {
  const keys = [];
  let continuationToken;
  do {
    const resp = await client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const o of resp.Contents || []) keys.push(o.Key);
    continuationToken = resp.IsTruncated ? resp.NextContinuationToken : null;
  } while (continuationToken);
  return keys;
}

export async function getJson(client, key) {
  const resp = await client.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
  );
  const text = await resp.Body.transformToString();
  return JSON.parse(text);
}

export async function putJson(client, key, obj) {
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: JSON.stringify(obj, null, 2) + '\n',
      ContentType: 'application/json',
      CacheControl: 'public, max-age=300',
    }),
  );
}
