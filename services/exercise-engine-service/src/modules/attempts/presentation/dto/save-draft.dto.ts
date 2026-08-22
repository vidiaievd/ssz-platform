import { ApiProperty } from '@nestjs/swagger';
import { Allow } from 'class-validator';

export class SaveDraftRequestDto {
  @ApiProperty({
    description:
      'The work so far, in the same shape a submission carries. writing_task: ' +
      '{ text, ticked, elapsedSeconds }. Stored exactly as it arrives and never ' +
      'validated — a save refused because half a sentence does not parse is the ' +
      'failure this endpoint exists to prevent.',
  })
  @Allow()
  draftAnswer!: unknown;
}

export class SaveDraftResponseDto {
  @ApiProperty({
    description: 'When the server took the draft. The runner shows it as «Utkast lagret».',
  })
  savedAt!: Date;
}
