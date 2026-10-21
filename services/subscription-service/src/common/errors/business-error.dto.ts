import { ApiProperty } from '@nestjs/swagger';

/** Body of every 422 the service returns for a domain refusal. */
export class BusinessErrorDto {
  @ApiProperty({ example: 422 })
  statusCode!: number;

  @ApiProperty({ example: 'plan_archived', description: 'Stable machine-readable reason' })
  code!: string;

  @ApiProperty({ example: 'Plan "old_school" is archived and cannot be assigned' })
  message!: string;

  @ApiProperty({ example: { code: 'plan_archived', planCode: 'old_school' }, description: 'The refusal with its fields' })
  details!: Record<string, unknown>;
}
