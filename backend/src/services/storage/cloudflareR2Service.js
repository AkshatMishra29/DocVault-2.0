import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../../config/index.js';

let s3Client = null;

if (config.cloudflareR2.accountId && config.cloudflareR2.accessKeyId && config.cloudflareR2.secretAccessKey) {
  try {
    const endpoint = config.cloudflareR2.endpoint || `https://${config.cloudflareR2.accountId}.r2.cloudflarestorage.com`;

    s3Client = new S3Client({
      region: 'auto',
      endpoint: endpoint,
      credentials: {
        accessKeyId: config.cloudflareR2.accessKeyId,
        secretAccessKey: config.cloudflareR2.secretAccessKey,
      },
    });

    console.log(`[Cloudflare R2] Successfully configured for bucket: ${config.cloudflareR2.bucketName}`);
  } catch (err) {
    console.error('[Cloudflare R2] Initialization error:', err.message);
  }
}

/**
 * Upload file buffer to Cloudflare R2
 */
export async function uploadToR2(fileBuffer, destinationPath, mimetype) {
  if (!s3Client) {
    throw new Error('Cloudflare R2 client is not configured.');
  }

  const bucketName = config.cloudflareR2.bucketName;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: destinationPath,
    Body: fileBuffer,
    ContentType: mimetype,
  });

  await s3Client.send(command);

  // Generate signed read URL valid for 30 days (max 7 days on S3 signed URL, so we use 7 days)
  const getCommand = new GetObjectCommand({
    Bucket: bucketName,
    Key: destinationPath,
  });

  let downloadUrl;
  if (config.cloudflareR2.publicDomain) {
    downloadUrl = `${config.cloudflareR2.publicDomain.replace(/\/$/, '')}/${destinationPath}`;
  } else {
    // 7 days pre-signed URL (604800 seconds)
    downloadUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 7 * 24 * 3600 });
  }

  return {
    storagePath: destinationPath,
    downloadUrl: downloadUrl,
  };
}

/**
 * Delete file from Cloudflare R2
 */
export async function deleteFromR2(destinationPath) {
  if (!s3Client) return;

  try {
    const command = new DeleteObjectCommand({
      Bucket: config.cloudflareR2.bucketName,
      Key: destinationPath,
    });
    await s3Client.send(command);
  } catch (err) {
    console.error('[Cloudflare R2] Delete error:', err.message);
  }
}

export function isR2Configured() {
  return Boolean(s3Client && config.cloudflareR2.bucketName);
}

/**
 * Generate a short-lived presigned PUT URL for direct browser-to-R2 encrypted upload.
 * The Node.js server never sees or buffers the file bytes.
 */
export async function getPresignedR2UploadUrl(destinationPath, contentType = 'application/octet-stream', expiresIn = 120) {
  if (!s3Client) {
    throw new Error('Cloudflare R2 client is not configured.');
  }
  const command = new PutObjectCommand({
    Bucket: config.cloudflareR2.bucketName,
    Key: destinationPath,
    ContentType: contentType,
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Generate a short-lived presigned GET URL for direct browser-to-R2 encrypted download.
 */
export async function getPresignedR2DownloadUrl(destinationPath, expiresIn = 300) {
  if (!s3Client) {
    throw new Error('Cloudflare R2 client is not configured.');
  }
  const command = new GetObjectCommand({
    Bucket: config.cloudflareR2.bucketName,
    Key: destinationPath,
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

