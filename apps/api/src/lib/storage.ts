import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { env } from "../env.js";

export const s3 = new S3Client({
  endpoint: env.s3Endpoint,
  region: "us-east-1",
  credentials: { accessKeyId: env.s3AccessKey, secretAccessKey: env.s3SecretKey },
  forcePathStyle: true,
});

/** Create the bucket if it doesn't already exist. Call once at startup. */
export async function ensureBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.s3Bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: env.s3Bucket }));
    console.log(`Created MinIO bucket "${env.s3Bucket}"`);
  }
}

/** Returns the public URL for an object key. */
export function objectUrl(key: string): string {
  return `${env.s3Endpoint}/${env.s3Bucket}/${key}`;
}

/** Extracts the object key from a URL produced by objectUrl(). */
export function keyFromUrl(url: string): string {
  const prefix = `${env.s3Endpoint}/${env.s3Bucket}/`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : url;
}

export async function uploadObject(
  key: string,
  data: Buffer,
  contentType: string,
): Promise<string> {
  await s3.send(
    new PutObjectCommand({ Bucket: env.s3Bucket, Key: key, Body: data, ContentType: contentType }),
  );
  return objectUrl(key);
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: env.s3Bucket, Key: key }));
}
