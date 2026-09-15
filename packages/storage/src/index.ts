/**
 * @fleetai/storage — S3 client factory + key layout + presigning.
 *
 * Key layout (ported from legacy `lib/storage.ts`):
 *   `<prefix>[public/]uploads/<folder>/<ts>-<name>`
 * The service never proxies bytes — clients upload directly with presigned URLs.
 */

export interface StorageConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKey?: string;
  secretKey?: string;
  forcePathStyle: boolean;
  publicBaseUrl?: string;
  prefix?: string;
  /** Presigned URL TTL in seconds. */
  presignTtlSec?: number;
}

export interface StorageClient {
  presignPut(key: string, contentType: string, size?: number): Promise<{ url: string; headers: Record<string, string> }>;
  presignGet(key: string, ttlSec?: number): Promise<string>;
  presignMultipartInitiate(key: string, contentType: string): Promise<{ uploadId: string }>;
  presignMultipartPart(key: string, uploadId: string, partNumber: number): Promise<string>;
  presignMultipartComplete(key: string, uploadId: string, parts: { PartNumber: number; ETag: string }[]): Promise<string>;
  headObject(key: string): Promise<{ size: number; contentType?: string }>;
  deleteObject(key: string): Promise<void>;
  publicUrl(key: string): string;
}

/**
 * Builds the storage key: `<prefix>[public/]uploads/<folder>/<ts>-<name>`.
 * `name` is sanitised (slashes and path separators removed).
 */
export function buildKey(folder: string, name: string, opts: { public?: boolean; prefix?: string } = {}): string {
  const safeName = name.replace(/[\\/]/g, '-').trim();
  const safeFolder = folder.replace(/[\\/]/g, '/').replace(/^\/+|\/+$/g, '');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = opts.prefix ? `${opts.prefix.replace(/\/+$/, '')}/` : '';
  const visibility = opts.public ? 'public/' : '';
  return `${prefix}${visibility}uploads/${safeFolder}/${ts}-${safeName}`;
}

/**
 * Factory that lazily constructs the AWS S3 client. The @aws-sdk/client-s3
 * dependency is optional here so non-storage workspaces don't install it;
 * services that use storage add it to their own deps.
 */
export async function createStorageClient(config: StorageConfig): Promise<StorageClient> {
  const { S3Client, PutObjectCommand, GetObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, HeadObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint || undefined,
    forcePathStyle: config.forcePathStyle,
    credentials: config.accessKey
      ? { accessKeyId: config.accessKey, secretAccessKey: config.secretKey ?? '' }
      : undefined,
  });

  const ttl = config.presignTtlSec ?? 3600;

  return {
    async presignPut(key, contentType, size) {
      const command = new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        ContentType: contentType,
        ...(size ? { ContentLength: size } : {}),
      });
      const url = await getSignedUrl(client, command, { expiresIn: ttl });
      const headers = {
        'Content-Type': contentType,
        ...(size ? { 'Content-Length': String(size) } : {}),
      };
      return { url, headers };
    },

    async presignGet(key, ttlSec = ttl) {
      const command = new GetObjectCommand({ Bucket: config.bucket, Key: key });
      return getSignedUrl(client, command, { expiresIn: ttlSec });
    },

    async presignMultipartInitiate(key, contentType) {
      const command = new CreateMultipartUploadCommand({ Bucket: config.bucket, Key: key, ContentType: contentType });
      const res = await client.send(command);
      return { uploadId: res.UploadId! };
    },

    async presignMultipartPart(key, uploadId, partNumber) {
      const command = new UploadPartCommand({ Bucket: config.bucket, Key: key, UploadId: uploadId, PartNumber: partNumber });
      return getSignedUrl(client, command, { expiresIn: ttl });
    },

    async presignMultipartComplete(key, uploadId, parts) {
      const command = new CompleteMultipartUploadCommand({
        Bucket: config.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      });
      return getSignedUrl(client, command, { expiresIn: ttl });
    },

    async headObject(key) {
      const command = new HeadObjectCommand({ Bucket: config.bucket, Key: key });
      const res = await client.send(command);
      return { size: res.ContentLength ?? 0, contentType: res.ContentType };
    },

    async deleteObject(key) {
      const command = new DeleteObjectCommand({ Bucket: config.bucket, Key: key });
      await client.send(command);
    },

    publicUrl(key) {
      const base = config.publicBaseUrl ?? `${config.endpoint ?? ''}/${config.bucket}`;
      return `${base.replace(/\/+$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
    },
  };
}
