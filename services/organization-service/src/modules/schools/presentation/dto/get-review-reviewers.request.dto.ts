import { ArrayNotEmpty, IsArray, IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class GetReviewReviewersRequestDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  groupIds!: string[];

  // Defaults to now when omitted — most callers ask "who may review this
  // right now", not at a point in the past.
  @IsOptional()
  @IsISO8601()
  at?: string;
}
