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

/**
 * Builds the full public URL from an object key or a legacy full URL.
 * Handles pre-migration rows that still store a full URL (localhost or old LAN IP)
 * by re-basing them onto the current MINIO_PUBLIC_URL.
 */
export function objectUrl(keyOrUrl: string): string {
  if (keyOrUrl.startsWith("http")) {
    const match = keyOrUrl.match(/^https?:\/\/[^/]+\/[^/]+\/(.+)$/);
    const key = match?.[1] ?? keyOrUrl;
    return `${env.s3PublicUrl}/${env.s3Bucket}/${key}`;
  }
  return `${env.s3PublicUrl}/${env.s3Bucket}/${keyOrUrl}`;
}

/** Extracts the object key from a stored value (plain key or any full URL). */
export function keyFromUrl(url: string): string {
  const match = url.match(/^https?:\/\/[^/]+\/[^/]+\/(.+)$/);
  return match?.[1] ?? url;
}

/** Uploads data to MinIO and returns the object key (not a URL). */
export async function uploadObject(
  key: string,
  data: Buffer,
  contentType: string,
): Promise<string> {
  await s3.send(
    new PutObjectCommand({ Bucket: env.s3Bucket, Key: key, Body: data, ContentType: contentType }),
  );
  return key;
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: env.s3Bucket, Key: key }));
}
