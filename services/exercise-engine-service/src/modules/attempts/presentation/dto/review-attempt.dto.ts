import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** A rule the teacher marked as the one the learner got wrong (plan 85, step 9). */
export class FlaggedAtomDto {
  @ApiProperty({ enum: ['grammar_rule_atom'], example: 'grammar_rule_atom' })
  @IsIn(['grammar_rule_atom'])
  atomType!: 'grammar_rule_atom';

  @ApiProperty({ example: 'b6f1c0a4-3a0e-5a47-9d52-6a1e0f4d2c11' })
  @IsString()
  @MaxLength(64)
  atomId!: string;
}

/** What the teacher decided about one sentence of a submission. */
export class ReviewDecisionDto {
  @ApiProperty({ example: 'i7f3a1b2' })
  @IsString()
  itemId!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  approved!: boolean;

  @ApiPropertyOptional({ example: 'Riktig, men «bor» er presens — oppgaven ber om perfektum.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class ReviewAttemptRequestDto {
  /**
   * Who marked it. Sent by the caller rather than read from a token: these routes are
   * service-to-service, and the BFF has already established the teacher's identity and
   * their right to mark this exercise.
   */
  @ApiProperty({ example: 'uuid-of-teacher' })
  @IsString()
  reviewerId!: string;

  /**
   * `approved_comment` is accepted as a spelling of `approved`.
   *
   * The screen has three verdicts and the engine has two: an approval with something
   * written on it is still an approval, and what the learner is told apart by travels on
   * the event as `hasComment` (plan 44 §44.9). Taking the screen's word verbatim spares
   * every caller a mapping it can get wrong.
   */
  @ApiProperty({ enum: ['approved', 'approved_comment', 'returned'] })
  @IsIn(['approved', 'approved_comment', 'returned'])
  outcome!: 'approved' | 'approved_comment' | 'returned';

  @ApiPropertyOptional({ type: [ReviewDecisionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewDecisionDto)
  decisions?: ReviewDecisionDto[];

  @ApiPropertyOptional({ description: 'The teacher’s word on the submission as a whole' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  comment?: string;

  /**
   * A note against one sentence, keyed by item id — what the screen writes in the margin.
   * Folded into `decisions` on arrival; blanks and non-strings are dropped there.
   */
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { i2: '«bor» er presens — oppgaven ber om perfektum.' },
  })
  @IsOptional()
  @IsObject()
  sentenceComments?: Record<string, string>;

  /**
   * One mark 0-3 per rubric criterion — `writing_task` and anything else graded that way.
   *
   * Judgements, not a score: the weights, the threshold and the arithmetic stay on the
   * server, and for these submissions `outcome` above is ignored entirely — the verdict
   * follows from `Σ mark × weight` against the rubric frozen on the attempt (plan 50
   * §3.2). Every criterion must carry a mark; a rubric with a hole in it is refused
   * rather than scored as a zero.
   *
   * `read_aloud` keys a mark by prompt and criterion, `"<itemId>:<criterionId>"`, and grades
   * each prompt on its own (plan 70 §3.6); its per-prompt comment is mandatory and arrives
   * in `sentenceComments`, keyed by the prompt's id.
   */
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'integer', minimum: 0, maximum: 3 },
    example: { 'c-task': 3, 'c-structure': 2, 'c-language': 2, 'c-lexis': 1 },
  })
  @IsOptional()
  @IsObject()
  rubricMarks?: Record<string, number>;

  /**
   * What the reviewer did with the model's draft (plan 79, 1.5), keyed as the card keeps it:
   * a remark's index, `summary` for the overall note, `draft` for dropping all of it. A
   * remark with no key was left alone. Sent only when the reviewer was shown a draft —
   * absent, the draft stays unlabelled. Unknown keys and values are dropped.
   */
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'string', enum: ['accepted', 'edited', 'discarded'] },
    example: { '0': 'accepted', '1': 'edited', '2': 'discarded', summary: 'accepted' },
  })
  @IsOptional()
  @IsObject()
  aiOutcomes?: Record<string, string>;

  /**
   * Rule atoms the teacher marked while reviewing (plan 85, step 9), whatever the model
   * said. Published as `exercise.feedback.atoms_flagged` with `source: 'teacher'` — the one
   * source that lapses a card — after the verdict is stored. Which course the atoms belong
   * to is the screen's catalogue to guarantee; unknown ids find no card and do nothing.
   */
  @ApiPropertyOptional({ type: [FlaggedAtomDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => FlaggedAtomDto)
  flaggedAtoms?: FlaggedAtomDto[];
}
