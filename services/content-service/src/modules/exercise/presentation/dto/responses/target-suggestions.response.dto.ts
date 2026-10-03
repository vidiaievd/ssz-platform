import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  ItemSuggestions,
  TargetSuggestion,
  TargetSuggestionsView,
} from '../../../application/queries/get-target-suggestions/get-target-suggestions.handler.js';

export class TargetSuggestionResponseDto {
  @ApiProperty({ example: 'vocabulary_item' })
  atomType!: string;

  @ApiProperty({ format: 'uuid' })
  atomId!: string;

  @ApiProperty({ example: 'stillingsannonse' })
  title!: string;

  @ApiProperty({ example: 'lexis' })
  track!: string;

  @ApiProperty({
    example: 'context',
    description:
      'Proposed role. A word is `focus` in a vocabulary exercise and `context` in a grammar ' +
      'drill, where the learner had to know it but was not examined on it.',
  })
  role!: string;

  @ApiProperty({
    enum: ['word_exact', 'word_inflected', 'rule_single_atom', 'rule_candidate'],
    description:
      'Why this is being suggested. `word_inflected` means the gap answers a form of the ' +
      'word rather than its dictionary spelling — `stillingsannonser` for ' +
      '`stillingsannonse`, which is the ordinary case in Norwegian.',
  })
  reason!: string;

  @ApiProperty({
    description:
      'False where the author has to choose — a rule with several atoms, or two words ' +
      'matching the same gap.',
  })
  confident!: boolean;
}

export class ItemSuggestionsResponseDto {
  @ApiPropertyOptional({ nullable: true, example: 's1#8' })
  itemKey!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'G1 — stillingsannonser' })
  label!: string | null;

  @ApiProperty({ description: 'Accepting a suggestion here would replace what is already set.' })
  alreadyAddressed!: boolean;

  @ApiProperty({ type: [TargetSuggestionResponseDto] })
  suggestions!: TargetSuggestionResponseDto[];
}

export class TargetSuggestionsResponseDto {
  @ApiProperty({ format: 'uuid' })
  exerciseId!: string;

  @ApiProperty({ example: 'word_bank_gap_fill' })
  templateCode!: string;

  @ApiProperty({ type: [ItemSuggestionsResponseDto] })
  items!: ItemSuggestionsResponseDto[];

  @ApiProperty({
    description:
      'Rules this exercise practises that nobody has cut into atoms yet — the one actionable ' +
      'thing to report when the suggestions are otherwise empty.',
  })
  rulesWithoutAtoms!: Array<{ ruleId: string; title: string }>;

  static from(view: TargetSuggestionsView): TargetSuggestionsResponseDto {
    const dto = new TargetSuggestionsResponseDto();
    dto.exerciseId = view.exerciseId;
    dto.templateCode = view.templateCode;
    dto.items = view.items.map((item: ItemSuggestions) => ({
      itemKey: item.itemKey,
      label: item.label,
      alreadyAddressed: item.alreadyAddressed,
      suggestions: item.suggestions.map((suggestion: TargetSuggestion) => ({ ...suggestion })),
    }));
    dto.rulesWithoutAtoms = view.rulesWithoutAtoms;
    return dto;
  }
}
