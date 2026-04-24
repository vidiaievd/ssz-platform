import { Global, Module } from '@nestjs/common';
import { STORAGE_SERVICE } from '../../shared/application/ports/storage.port.js';
import { S3StorageService } from './s3-storage.service.js';

@Global()
@Module({
  providers: [
    S3StorageService,
    {
      provide: STORAGE_SERVICE,
      useExisting: S3StorageService,
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
