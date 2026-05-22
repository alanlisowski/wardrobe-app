import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
} from "@aws-sdk/client-s3";
import { env } from "../env.js";

export const s3 = new S3Client({
  endpoint: env.s3Endpoint,
  region: "us-east-1",
  credentials: { accessKeyId: env.s3AccessKey, secretAccessKey: env.s3SecretKey },
  forcePathStyle: true,
});

const publicReadPolicy = (bucket: string) =>
  JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { AWS: ["*"] },
        Action: ["s3:GetObject"],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  });

/** Ensure the bucket exists and is publicly readable. Called once at startup. */
export async function ensureBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.s3Bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: env.s3Bucket }));
    console.log(`Created MinIO bucket "${env.s3Bucket}"`);
  }
  // Apply public-read so the mobile app can fetch images directly without presigned URLs.
  await s3.send(
    new PutBucketPolicyCommand({
      Bucket: env.s3Bucket,
      Policy: publicReadPolicy(env.s3Bucket),
    }),
  );
  console.log(`Bucket "${env.s3Bucket}" is public-read`);
}

/** Returns the public URL for an object key (uses MINIO_PUBLIC_URL if set). */
export function objectUrl(key: string): string {
  return `${env.s3PublicUrl}/${env.s3Bucket}/${key}`;
}

/** Extracts the object key from a URL produced by objectUrl(). Handles both
 *  the public base URL and the internal s3Endpoint so delete works for items
 *  uploaded before and after MINIO_PUBLIC_URL was set. */
export function keyFromUrl(url: string): string {
  const publicPrefix = `${env.s3PublicUrl}/${env.s3Bucket}/`;
  const internalPrefix = `${env.s3Endpoint}/${env.s3Bucket}/`;
  if (url.startsWith(publicPrefix)) return url.slice(publicPrefix.length);
  if (url.startsWith(internalPrefix)) return url.slice(internalPrefix.length);
  return url;
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
