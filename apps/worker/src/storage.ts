import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { env } from "./env.js";

const s3 = new S3Client({
  endpoint: env.s3Endpoint,
  region: "us-east-1",
  credentials: { accessKeyId: env.s3AccessKey, secretAccessKey: env.s3SecretKey },
  forcePathStyle: true,
});

/** Strips any full URL to a bare object key — handles localhost, LAN IPs, or already-plain keys. */
export function keyFromUrl(url: string): string {
  const match = url.match(/^https?:\/\/[^/]+\/[^/]+\/(.+)$/);
  return match?.[1] ?? url;
}

export async function downloadObject(key: string): Promise<Buffer> {
  const res = await s3.send(
    new GetObjectCommand({ Bucket: env.s3Bucket, Key: key }),
  );
  const body = res.Body as NodeJS.ReadableStream | undefined;
  if (!body) throw new Error(`empty body for object ${key}`);

  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Uploads data to MinIO and returns the object key (not a URL). */
export async function uploadObject(
  key: string,
  data: Buffer,
  contentType: string,
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.s3Bucket,
      Key: key,
      Body: data,
      ContentType: contentType,
    }),
  );
  return key;
}
