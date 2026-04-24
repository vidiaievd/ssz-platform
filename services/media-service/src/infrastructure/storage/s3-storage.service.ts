import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import type { Readable } from 'stream';
import type { AppConfig } from '../../config/configuration.js';
import type {
  IStorageService,
  ObjectMetadata,
  PresignedUploadResult,
} from '../../shared/application/ports/storage.port.js';

// Public bucket policy — allows anonymous GET on all objects.
const publicReadPolicy = (bucket: string) =>
  JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  });

@Injectable()
export class S3StorageService implements IStorageService, OnModuleInit {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly client: Client;
  private readonly bucketPublic: string;
  private readonly bucketPrivate: string;
  private readonly publicBaseUrl: string;

  constructor(private readonly config: ConfigService<AppConfig>) {
    const minio = this.config.get<AppConfig['minio']>('minio')!;

    this.client = new Client({
      endPoint: minio.endpoint,
      port: minio.port,
      useSSL: minio.useSsl,
      accessKey: minio.accessKey,
      secretKey: minio.secretKey,
    });

    this.bucketPublic = minio.bucketPublic;
    this.bucketPrivate = minio.bucketPrivate;

    const protocol = minio.useSsl ? 'https' : 'http';
    this.publicBaseUrl = `${protocol}://${minio.endpoint}:${minio.port}/${minio.bucketPublic}`;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureBucket(this.bucketPublic, true);
      await this.ensureBucket(this.bucketPrivate, false);
    } catch (err) {
      // Non-fatal on startup — MinIO may not be running in local dev without Docker.
      // Upload/download operations will fail at request time with a clear error.
      this.logger.warn(
        `MinIO is not reachable at startup: ${err instanceof Error ? err.message : String(err)}. ` +
          'Start MinIO (docker compose up minio) before using upload endpoints.',
      );
    }
  }

  async generatePresignedUploadUrl(
    key: string,
    _mimeType: string,
    isPublic: boolean,
    ttlSeconds: number,
  ): Promise<PresignedUploadResult> {
    const bucket = this.bucket(isPublic);
    const url = await this.client.presignedPutObject(bucket, key, ttlSeconds);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    this.logger.debug(`Generated upload URL for key "${key}" in bucket "${bucket}"`);
    return { uploadUrl: url, expiresAt };
  }

  async generatePresignedDownloadUrl(key: string, ttlSeconds: number): Promise<string> {
    const url = await this.client.presignedGetObject(this.bucketPrivate, key, ttlSeconds);
    this.logger.debug(`Generated download URL for key "${key}"`);
    return url;
  }

  getPublicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }

  async objectExists(key: string, isPublic: boolean): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket(isPublic), key);
      return true;
    } catch {
      return false;
    }
  }

  async getObjectMetadata(key: string, isPublic: boolean): Promise<ObjectMetadata | null> {
    try {
      const stat = await this.client.statObject(this.bucket(isPublic), key);
      return {
        sizeBytes: BigInt(stat.size),
        mimeType: (stat.metaData?.['content-type'] as string | undefined) ?? 'application/octet-stream',
        lastModified: stat.lastModified,
      };
    } catch {
      return null;
    }
  }

  async deleteObject(key: string, isPublic: boolean): Promise<void> {
    await this.client.removeObject(this.bucket(isPublic), key);
    this.logger.debug(`Deleted object "${key}" from bucket "${this.bucket(isPublic)}"`);
  }

  async getObject(key: string, isPublic: boolean): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket(isPublic), key) as Readable;
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async uploadObject(key: string, data: Buffer, mimeType: string, isPublic: boolean): Promise<void> {
    await this.client.putObject(this.bucket(isPublic), key, data, data.length, {
      'Content-Type': mimeType,
    });
    this.logger.debug(`Uploaded object "${key}" (${data.length} bytes) to bucket "${this.bucket(isPublic)}"`);
  }

  private bucket(isPublic: boolean): string {
    return isPublic ? this.bucketPublic : this.bucketPrivate;
  }

  private async ensureBucket(name: string, isPublic: boolean): Promise<void> {
    const exists = await this.client.bucketExists(name);

    if (!exists) {
      await this.client.makeBucket(name);
      this.logger.log(`Created bucket "${name}"`);
    }

    if (isPublic) {
      await this.client.setBucketPolicy(name, publicReadPolicy(name));
      this.logger.log(`Set public-read policy on bucket "${name}"`);
    }
  }
}
