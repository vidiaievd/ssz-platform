import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsUUID } from 'class-validator';

export const RECORDINGS_IN_USE_MAX = 200;

export class RecordingsInUseRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(RECORDINGS_IN_USE_MAX)
  @IsUUID('all', { each: true })
  assetIds!: string[];

  /** ISO 8601. A draft saved before this is a draft nobody is recording into any more. */
  @IsDateString()
  liveDraftSince!: string;
}
