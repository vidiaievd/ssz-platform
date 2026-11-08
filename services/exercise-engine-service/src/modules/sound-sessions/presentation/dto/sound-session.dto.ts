import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

export class StartSoundSessionRequestDto {
  @ApiProperty({ example: 'nb', description: 'The language whose sounds are drilled' })
  @IsString()
  @Matches(/^[a-z]{2,3}$/i, { message: 'language must be a language code such as nb' })
  language!: string;

  @ApiPropertyOptional({
    example: 'nb:kj',
    description: 'A sound the learner chose (from its card). Absent — the session chooses: due cards, flagged sounds, else a diagnostic',
  })
  @IsOptional()
  @Matches(/^[a-z]{2,3}:[a-z_]+$/, { message: 'atomId must be a sound atom such as nb:kj' })
  atomId?: string;
}

class SessionSoundDto {
  @ApiProperty({ example: 'nb:kj' }) atomId!: string;
  @ApiProperty({ example: 'kj' }) family!: string;
  @ApiProperty({ enum: ['pending', 'open', 'passed', 'failed'] }) status!: string;
}

class SessionDiagnosticDto {
  @ApiProperty({ example: 3, description: 'Families measured or given up on so far' }) measured!: number;
  @ApiProperty({ example: 8 }) total!: number;
}

export class SoundSessionResponseDto {
  @ApiProperty() attemptId!: string;
  @ApiProperty({ description: 'The probe the session runs on (template `sound_session`)' }) probeId!: string;
  @ApiProperty({ description: 'An open session was handed back rather than a new one begun' }) resumed!: boolean;
  @ApiProperty({ example: 'nb' }) language!: string;
  @ApiProperty({ enum: ['chosen', 'record', 'diagnostic'], description: 'Why these sounds' }) basis!: string;
  @ApiProperty({ description: 'When the probe stops being answerable' }) expiresAt!: string;
  @ApiProperty({ enum: ['diagnostic', 'drill', 'done'] }) phase!: string;
  @ApiProperty({ enum: ['finished', 'take_limit', 'stopped', 'pool_empty'], nullable: true }) doneReason!: string | null;
  @ApiProperty({ example: 0, description: 'Takes of the drill so far (the diagnostic is not counted)' }) takes!: number;
  @ApiProperty({ example: 10 }) maxTakes!: number;
  @ApiProperty({ type: [SessionSoundDto], description: 'Empty until the diagnostic is over' }) sounds!: SessionSoundDto[];
  @ApiProperty({ type: SessionDiagnosticDto, nullable: true }) diagnostic!: SessionDiagnosticDto | null;
  @ApiProperty({
    nullable: true,
    description:
      'What to say now: `{ phase: "diagnostic", atomId, family, index, total, word }` or ' +
      '`{ phase: "drill", atomId, family, elementIndex, element: word | pair | phrase, say, fails }`; null once done',
  })
  step!: unknown;
}
