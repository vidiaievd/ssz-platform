import { ApiProperty } from '@nestjs/swagger';

export class ClashEntryDto {
  @ApiProperty() lessonAId!: string;
  @ApiProperty() lessonBId!: string;
  @ApiProperty() date!: string;
  @ApiProperty() groupAId!: string;
  @ApiProperty() groupBId!: string;
  @ApiProperty() startTime!: string;
}
