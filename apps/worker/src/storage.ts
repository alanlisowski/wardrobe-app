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

export function objectUrl(key: string): string {
  return `${env.s3Endpoint}/${env.s3Bucket}/${key}`;
}

export function keyFromUrl(url: string): string {
  const prefix = `${env.s3Endpoint}/${env.s3Bucket}/`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : url;
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
  return objectUrl(key);
}
