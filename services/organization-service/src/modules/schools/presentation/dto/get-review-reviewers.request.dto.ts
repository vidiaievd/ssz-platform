import { ArrayNotEmpty, IsArray, IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class GetReviewReviewersRequestDto {
  @IsArray()
  @ArrayNotEmpty()
  // Any version, as everywhere ids from another service arrive.
  @IsUUID(undefined, { each: true })
  groupIds!: string[];

  // Defaults to now when omitted — most callers ask "who may review this
  // right now", not at a point in the past.
  @IsOptional()
  @IsISO8601()
  at?: string;
}
