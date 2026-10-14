import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

export class MediaInUseRequestDto {
  // Any UUID version: seeded content ids are v5, uploads are v4.
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  assetIds!: string[];
}
