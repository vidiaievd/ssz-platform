import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsString, IsUUID, MaxLength } from 'class-validator';
import { AssistantMode } from '../../domain/value-objects/assistant-access.vo.js';

/**
 * Which students the school's assistant answers on the school's account, set whole: both
 * lists travel with every mode, and a list left empty is saved empty.
 */
export class UpdateAssistantAccessRequestDto {
  @ApiProperty({
    enum: Object.values(AssistantMode),
    example: 'selected_groups',
    description:
      'off — nobody; all_students — every active student; selected_groups — active members of groupIds; ' +
      'selected_students — studentIds. Any mode but off needs the plan feature ai.student_assist. ' +
      'A student outside the choice asks on their own plan.',
  })
  @IsIn(Object.values(AssistantMode))
  mode!: AssistantMode;

  @ApiProperty({ type: [String], example: ['8c0e5a52-2f7c-4f36-9a3e-1d8a1b8f0c11'], description: "The school's own groups, not deleted" })
  @IsArray()
  @ArrayMaxSize(5000)
  @IsUUID('all', { each: true })
  groupIds!: string[];

  @ApiProperty({ type: [String], example: [], description: "User ids of the school's active students" })
  @IsArray()
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  studentIds!: string[];
}

export class AssistantAccessResponseDto {
  @ApiProperty({ enum: Object.values(AssistantMode) }) mode!: AssistantMode;
  @ApiProperty({ type: [String], description: 'Kept whatever the mode; deleted groups left out' }) groupIds!: string[];
  @ApiProperty({ type: [String], description: 'Kept whatever the mode; archived students left out' }) studentIds!: string[];
}
