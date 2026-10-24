import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { AiDraftBodyDto } from './put-ai-draft.dto.js';

export class AiItemDecisionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  itemId!: string;

  @IsBoolean()
  approved!: boolean;
}

/**
 * The model's ruling. `decisions` covers the items the machine left open; any it sends on an
 * item the machine closed is not read (Q4-C). For an essay the marks in the body are the
 * ruling, and `outcome` is not read either.
 */
export class AiVerdictDto {
  @IsIn(['approved', 'returned'])
  outcome!: 'approved' | 'returned';

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AiItemDecisionDto)
  decisions!: AiItemDecisionDto[];
}

/** A learner's review (plan 79, step 2.1b): the draft body plus, when `ready`, its verdict. */
export class PutAiReviewDto extends AiDraftBodyDto {
  /** Required for `ready`; not read for `failed`. */
  @ValidateIf((o: PutAiReviewDto) => o.status === 'ready')
  @IsDefined()
  @ValidateNested()
  @Type(() => AiVerdictDto)
  verdict?: AiVerdictDto;
}
