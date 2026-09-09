import { IsArray, IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class GetReviewEscalationRecipientsRequestDto {
  @IsUUID()
  schoolId!: string;

  /**
   * The groups the late work belongs to. Optional, and empty is a valid answer to it:
   * only the `primary_teacher` target reads them, and a school that escalates to its
   * admins does not care which group was late.
   */
  @IsOptional()
  @IsArray()
  // Any version, as everywhere ids from another service arrive.
  @IsUUID(undefined, { each: true })
  groupIds?: string[];

  @IsOptional()
  @IsISO8601()
  at?: string;
}
