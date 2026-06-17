import { ApiProperty } from '@nestjs/swagger';

export class NudgeStudentResponseDto {
  @ApiProperty({ example: true })
  sent: true;
}
