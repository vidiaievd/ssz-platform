import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

const MODALITIES = ['recognition', 'recall', 'production', 'unknown'] as const;
const DIFFICULTY_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
const SKILLS = ['listening', 'reading', 'spoken', 'written'] as const;
const FOCUS = ['vocabulary', 'grammar', 'orthography', 'pragmatics'] as const;

export class ProbeSubjectDto {
  @ApiProperty({
    description:
      'The kind of atom this probe is about, as Content Service names it — ' +
      "'vocabulary_item' or 'grammar_rule_atom'.",
  })
  @IsString()
  @IsNotEmpty()
  atomType!: string;

  @ApiProperty({ description: 'The atom itself.' })
  @IsString()
  @IsNotEmpty()
  atomId!: string;
}

export class ProbeTargetDto {
  @ApiPropertyOptional({
    description:
      "The template's own name for the piece this address belongs to " +
      '(`sentenceId#tokenIndex` for a gap, the pair id for a pair). Leave it out to ' +
      'address the task as a whole, which is all a template graded as one can offer.',
  })
  @IsString()
  @IsOptional()
  itemKey?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  atomType!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  atomId!: string;

  @ApiProperty({
    enum: ['focus', 'context'],
    description:
      'What the item examined (`focus`) versus what the learner had to know to get ' +
      'there and was not examined on (`context`). Both are evidence; they do not weigh ' +
      'the same.',
  })
  @IsEnum(['focus', 'context'])
  role!: 'focus' | 'context';
}

export class ProbeInstructionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  language!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  text!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  hint?: string;
}

export class CreateProbeRequestDto {
  @ApiProperty({ type: ProbeSubjectDto, description: 'The one atom this probe is about.' })
  @ValidateNested()
  @Type(() => ProbeSubjectDto)
  subject!: ProbeSubjectDto;

  @ApiProperty({
    enum: MODALITIES,
    description:
      'How the learner has to produce the answer. The reason a probe is worth making ' +
      'when the catalogue already has exercises on the atom: what is usually missing is ' +
      'not practice but practice of a kind never yet seen.',
  })
  @IsEnum(MODALITIES)
  requiredModality!: (typeof MODALITIES)[number];

  @ApiProperty({ description: 'Template the task is built on. Must be one the engine can score.' })
  @IsString()
  @IsNotEmpty()
  templateCode!: string;

  @ApiProperty({ description: 'Language the task is in, e.g. "no".' })
  @IsString()
  @IsNotEmpty()
  targetLanguage!: string;

  @ApiProperty({ enum: DIFFICULTY_LEVELS })
  @IsEnum(DIFFICULTY_LEVELS)
  difficultyLevel!: (typeof DIFFICULTY_LEVELS)[number];

  @ApiProperty({
    description: 'The task document, in the shape the template stores — same as an exercise.',
  })
  @IsObject()
  content!: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'The answer key, in the shape the template stores.' })
  @IsOptional()
  expectedAnswers?: unknown;

  @ApiPropertyOptional({ description: "Overrides on top of the template's check settings." })
  @IsObject()
  @IsOptional()
  answerCheckSettings?: Record<string, unknown>;

  @ApiPropertyOptional({ type: ProbeInstructionDto })
  @ValidateNested()
  @Type(() => ProbeInstructionDto)
  @IsOptional()
  instruction?: ProbeInstructionDto;

  @ApiPropertyOptional({
    enum: SKILLS,
    isArray: true,
    description:
      'What channel the task exercises. Declared rather than derived: a probe has no ' +
      'placement to derive it from, which is the point of a probe.',
  })
  @IsArray()
  @IsEnum(SKILLS, { each: true })
  @IsOptional()
  skills?: (typeof SKILLS)[number][];

  @ApiPropertyOptional({ enum: FOCUS, isArray: true })
  @IsArray()
  @IsEnum(FOCUS, { each: true })
  @IsOptional()
  focus?: (typeof FOCUS)[number][];

  @ApiPropertyOptional({
    type: ProbeTargetDto,
    isArray: true,
    description:
      'What each piece of the task is about. Leave it out and the subject atom becomes ' +
      'the address of the task as a whole, which is right for most probes. The subject ' +
      'is always addressed, whatever is sent here.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProbeTargetDto)
  @IsOptional()
  targets?: ProbeTargetDto[];

  @ApiPropertyOptional({
    description:
      'How long the probe is worth answering, in seconds. Clamped to the service ' +
      'ceiling; defaults to six hours.',
  })
  @IsInt()
  @IsPositive()
  @IsOptional()
  ttlSeconds?: number;
}

/** The same body, plus the learner it is for — only a service may name someone else. */
export class CreateProbeForUserRequestDto extends CreateProbeRequestDto {
  @ApiProperty({ description: 'The learner this probe is dealt to.' })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiPropertyOptional({
    enum: ['manual', 'generated'],
    description: "Where the task came from. Defaults to 'generated' on this route.",
  })
  @IsEnum(['manual', 'generated'])
  @IsOptional()
  source?: 'manual' | 'generated';
}

export class ProbeResponseDto {
  @ApiProperty({
    description:
      'The probe id. It is also what an attempt is started against — ' +
      '`POST /exercises/{id}/attempts` — so a runner needs no second route to open one.',
  })
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ type: ProbeSubjectDto })
  subject!: { atomType: string; atomId: string };

  @ApiProperty({ enum: MODALITIES })
  requiredModality!: string;

  @ApiProperty()
  templateCode!: string;

  @ApiProperty()
  targetLanguage!: string;

  @ApiProperty({ enum: DIFFICULTY_LEVELS })
  difficultyLevel!: string;

  @ApiProperty({ enum: SKILLS, isArray: true })
  skills!: string[];

  @ApiProperty({ enum: FOCUS, isArray: true })
  focus!: string[];

  @ApiProperty({ type: ProbeTargetDto, isArray: true })
  targets!: Array<{ itemKey: string | null; atomType: string; atomId: string; role: string }>;

  @ApiProperty({ enum: ['manual', 'generated'] })
  source!: string;

  @ApiProperty({ description: 'ISO 8601.' })
  createdAt!: string;

  @ApiProperty({ description: 'ISO 8601 — past this the probe opens for nobody.' })
  expiresAt!: string;

  @ApiProperty({ description: 'Seconds left, floored at zero.' })
  secondsRemaining!: number;

  @ApiProperty({
    nullable: true,
    description:
      'The catalogue exercise this probe was kept as, if a person decided it was worth ' +
      'keeping. Provenance only — the probe still expires.',
  })
  promotedExerciseId!: string | null;
}

export class ListProbesResponseDto {
  @ApiProperty({ type: ProbeResponseDto, isArray: true })
  items!: ProbeResponseDto[];
}

export class PromoteProbeResponseDto {
  @ApiProperty({
    description:
      'The catalogue exercise the task was kept as. Private to whoever promoted it, and ' +
      'from this moment a thing of its own — the probe still expires.',
  })
  exerciseId!: string;
}

export class SweepProbesResponseDto {
  @ApiProperty({ description: 'How many expired probes were deleted.' })
  deleted!: number;
}
