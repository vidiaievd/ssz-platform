import { ApiProperty } from '@nestjs/swagger';
import { MODALITIES } from '@ssz/shared-kernel/skills';
import type {
  AtomCoverageEntry,
  AtomCoverageIssue,
  AtomCoverageResult,
  AtomCoverageScope,
  AtomCoverageSummary,
  ModalityTally,
} from '../../../application/queries/get-atom-coverage/get-atom-coverage.handler.js';

class AtomCoverageSummaryDto {
  @ApiProperty({
    example: 24,
    description:
      'Atoms this scope teaches — the words its texts introduce and the atoms of the rules ' +
      'it presents. Not the size of `atoms`, which also holds what the scope only practises.',
  })
  introduced!: number;

  @ApiProperty({ example: { lexis: 21, grammar: 3 }, description: 'Both keys always present.' })
  introducedByTrack!: Record<string, number>;

  @ApiProperty({ example: 18, description: 'Introduced atoms some item of this scope tests.' })
  tested!: number;

  @ApiProperty({
    example: 6,
    description: 'Introduced and never tested. The report’s headline number.',
  })
  untested!: number;

  @ApiProperty({
    example: 2,
    description:
      'Named by items, never as what they test — required to answer, never examined. ' +
      'A weaker finding than `untested` and a different one.',
  })
  contextOnly!: number;

  @ApiProperty({
    example: 9,
    description: 'Tested, but every item testing them is the same modality.',
  })
  singleModality!: number;

  @ApiProperty({
    example: 4,
    description:
      'Atoms practised here and introduced somewhere else — revision, not a gap, and ' +
      'counted in none of the numbers above.',
  })
  practisedElsewhere!: number;

  @ApiProperty({
    example: { recognition: 41, recall: 12, production: 0, unknown: 3 },
    description:
      `Items that test something, by how the learner had to know it (${MODALITIES.join(', ')}); ` +
      'zeroes included. A `production: 0` is the single most useful thing this report says.',
  })
  byModality!: ModalityTally;

  @ApiProperty({ example: 40, description: 'Exercises reached by this scope.' })
  exercises!: number;

  @ApiProperty({
    example: 12,
    description:
      'Of those, the ones carrying any target at all. Read every finding above against ' +
      'this: six untested words means one thing when all forty exercises are addressed ' +
      'and nothing at all when twelve are.',
  })
  exercisesAddressed!: number;

  static from(summary: AtomCoverageSummary): AtomCoverageSummaryDto {
    return Object.assign(new AtomCoverageSummaryDto(), summary);
  }
}

class AtomCoverageEntryDto {
  @ApiProperty({ example: 'vocabulary_item', enum: ['vocabulary_item', 'grammar_rule_atom'] })
  atomType!: string;

  @ApiProperty()
  atomId!: string;

  @ApiProperty({ example: 'stillingsannonse' })
  title!: string;

  @ApiProperty({ example: 'lexis', enum: ['lexis', 'grammar'] })
  track!: string;

  @ApiProperty({ nullable: true, description: 'The rule a grammar atom belongs to.' })
  parentId!: string | null;

  @ApiProperty({ nullable: true })
  parentTitle!: string | null;

  @ApiProperty({
    example: ['glossary'],
    description:
      'Where the scope says it teaches this: `relation`, `glossary`, `text_span`, ' +
      '`exercise_pool`. Empty means the scope only practises it.',
  })
  introducedBy!: string[];

  @ApiProperty({ example: 3 })
  exercises!: number;

  @ApiProperty({ example: 4, description: 'Items testing it. Zero is what `untested` counts.' })
  focusItems!: number;

  @ApiProperty({ example: 1, description: 'Items that merely required it.' })
  contextItems!: number;

  @ApiProperty({
    example: { recognition: 4, recall: 0, production: 0, unknown: 0 },
    description: 'Testing items by modality, zeroes included. Context items are not here.',
  })
  byModality!: ModalityTally;

  static from(entry: AtomCoverageEntry): AtomCoverageEntryDto {
    return Object.assign(new AtomCoverageEntryDto(), entry);
  }
}

class AtomCoverageScopeDto {
  @ApiProperty()
  containerId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: AtomCoverageSummaryDto })
  summary!: AtomCoverageSummaryDto;

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  issues!: AtomCoverageIssue[];

  static from(scope: AtomCoverageScope): AtomCoverageScopeDto {
    const dto = new AtomCoverageScopeDto();
    dto.containerId = scope.containerId;
    dto.title = scope.title;
    dto.summary = AtomCoverageSummaryDto.from(scope.summary);
    dto.issues = scope.issues;
    return dto;
  }
}

export class AtomCoverageResponseDto {
  @ApiProperty()
  containerId!: string;

  @ApiProperty({ example: 'course' })
  containerType!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: ['draft', 'published'] })
  version!: string;

  @ApiProperty({
    example: true,
    description:
      'False when the container has no such version — not a course that teaches nothing.',
  })
  available!: boolean;

  @ApiProperty({ type: AtomCoverageSummaryDto })
  summary!: AtomCoverageSummaryDto;

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description:
      'Findings as codes and the numbers their message needs, never prose: the authoring ' +
      'UI renders them in four languages. None of them blocks publishing.',
  })
  issues!: AtomCoverageIssue[];

  @ApiProperty({ type: [AtomCoverageEntryDto], description: 'Worst first, then by title.' })
  atoms!: AtomCoverageEntryDto[];

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description:
      'Rules this scope teaches or drills that nobody has cut into atoms. Named rather ' +
      'than silently contributing nothing — it is the one thing an author can act on when ' +
      'the grammar side of the report is empty.',
  })
  rulesWithoutAtoms!: Array<{ ruleId: string; title: string }>;

  @ApiProperty({
    type: [AtomCoverageScopeDto],
    description:
      'Direct children, summarised. Their atom lists are one request away and are not ' +
      'repeated here.',
  })
  units!: AtomCoverageScopeDto[];

  static from(result: AtomCoverageResult): AtomCoverageResponseDto {
    const dto = new AtomCoverageResponseDto();
    dto.containerId = result.containerId;
    dto.containerType = result.containerType;
    dto.title = result.title;
    dto.version = result.version;
    dto.available = result.available;
    dto.summary = AtomCoverageSummaryDto.from(result.summary);
    dto.issues = result.issues;
    dto.atoms = result.atoms.map((entry) => AtomCoverageEntryDto.from(entry));
    dto.rulesWithoutAtoms = result.rulesWithoutAtoms;
    dto.units = result.units.map((unit) => AtomCoverageScopeDto.from(unit));
    return dto;
  }
}
