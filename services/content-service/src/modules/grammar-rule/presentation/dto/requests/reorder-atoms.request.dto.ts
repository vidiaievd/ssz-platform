import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';

export class ReorderAtomItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  atomId!: string;

  @ApiProperty({ minimum: 0, example: 0 })
  @IsInt()
  @Min(0)
  position!: number;
}

export class ReorderAtomsRequestDto {
  @ApiProperty({
    type: [ReorderAtomItemDto],
    description:
      'Every living atom of the rule, each with its new position. A subset is rejected: ' +
      'the atoms left out would still be holding positions the reordered ones are claiming.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderAtomItemDto)
  items!: ReorderAtomItemDto[];
}
