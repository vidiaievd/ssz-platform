import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export const ADMIN_REASON_MAX = 500;

/** Why an admin made the change — required on every change, it is the trail's main line. */
export function IsAdminReason(example = 'School asked to keep its data in the EU, ticket #142'): PropertyDecorator {
  return applyDecorators(
    ApiProperty({ example, maxLength: ADMIN_REASON_MAX, description: 'Why — goes to the admin trail; required, not blank' }),
    IsString(),
    Matches(/\S/, { message: 'reason must not be blank' }),
    MaxLength(ADMIN_REASON_MAX),
  );
}

/** Body of a change that carries nothing but its reason. */
export class AdminReasonDto {
  @IsAdminReason()
  reason!: string;
}
