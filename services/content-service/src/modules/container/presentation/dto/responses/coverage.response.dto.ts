import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FOCUSES, FORMS, MODALITIES, SKILLS } from '@ssz/shared-kernel/skills';
import type {
  Coverage,
  CoverageDifference,
  CoverageIssue,
  Recipe,
  RecipeIssue,
} from '@ssz/shared-kernel/skills';
import { RecipeDto } from '../../../../coverage-recipe/presentation/dto/recipe.dto.js';
import type {
  ContainerCoverageResult,
  CoverageReport,
  ModuleCoverage,
} from '../../../application/queries/get-container-coverage/get-container-coverage.handler.js';

class CoverageTalliesDto {
  @ApiProperty({
    example: 452,
    description:
      'How many exercises were counted. Not the sum of any tally below: an exercise can ' +
      'train two channels at once.',
  })
  total!: number;

  @ApiProperty({
    example: { listening: 0, reading: 380, spoken: 0, written: 72 },
    description: `One key per channel (${SKILLS.join(', ')}), zeroes included.`,
  })
  bySkill!: Record<string, number>;

  @ApiProperty({
    example: { vocabulary: 0, grammar: 0, orthography: 0, pronunciation: 0, pragmatics: 0, unknown: 452 },
    description: `One key per subject (${FOCUSES.join(', ')}) plus \`unknown\`, zeroes included.`,
  })
  byFocus!: Record<string, number>;

  @ApiProperty({
    example: { vocabulary: 0.375, grammar: 0.625, orthography: 0, pronunciation: 0, pragmatics: 0, unknown: 0 },
    description:
      'The same axis counted in elements rather than exercises: a set of eight questions, ' +
      'three about words and five about a rule, adds 0.375 to vocabulary and 0.625 to ' +
      'grammar, where `byFocus` counts it once under each. Exercises whose subject nobody ' +
      'recorded land in `unknown` at their full weight, so this still sums to `total`.',
  })
  byFocusWeighted!: Record<string, number>;

  @ApiProperty({
    example: { bank: 380, free: 60, mixed: 12, unknown: 0 },
    description:
      `Whether a bank of answers was on screen (${FORMS.join(', ')}). A raw fact kept for ` +
      'the issue rules; the report reads `byModality`, because a bank of chunks to put in ' +
      'order and a bank of options to pick from land here in one bucket.',
  })
  byForm!: Record<string, number>;

  @ApiProperty({
    example: { recognition: 300, recall: 110, production: 40, unknown: 2 },
    description:
      `How the answer had to be known (${MODALITIES.join(', ')}). The row that matters ` +
      'most: a course can be perfectly balanced across the four channels and still be 84% ' +
      'picking an answer off a list, and only this tally can see that (plan 64, decision G).',
  })
  byModality!: Record<string, number>;

  @ApiProperty({
    example: {
      listening: { vocabulary: 0, grammar: 0, orthography: 0, pronunciation: 0, pragmatics: 0, unknown: 0 },
    },
    description:
      'The skill × focus table the two tallies above are the margins of. A pair can be ' +
      'empty while neither of its margins is, so "this course never trains listening ' +
      'grammar" is a statement only this field can make.',
  })
  byPair!: Record<string, Record<string, number>>;

  @ApiProperty({
    example: ['listening', 'spoken'],
    description:
      'Channels no exercise trains, named rather than left to be diffed out of `bySkill`. ' +
      'A zero is a result, not a missing measurement.',
  })
  emptySkills!: string[];

  @ApiProperty({
    example: 0,
    description:
      'Exercises whose template the axis table does not know — silent under-counting otherwise.',
  })
  unclassified!: number;

  static from(coverage: Coverage): CoverageTalliesDto {
    const dto = new CoverageTalliesDto();
    dto.total = coverage.total;
    dto.bySkill = coverage.bySkill;
    dto.byFocus = coverage.byFocus;
    dto.byFocusWeighted = coverage.byFocusWeighted;
    dto.byForm = coverage.byForm;
    dto.byModality = coverage.byModality;
    dto.byPair = coverage.byPair;
    dto.emptySkills = coverage.emptySkills;
    dto.unclassified = coverage.unclassified;
    return dto;
  }
}

class ModuleCoverageDto {
  @ApiProperty()
  containerId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ type: CoverageTalliesDto })
  coverage!: CoverageTalliesDto;

  @ApiProperty({ type: 'array', items: { type: 'object', additionalProperties: true } })
  issues!: CoverageIssue[];

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description:
      'What this lesson lacks against the recipe: `RECIPE_BELOW_MIN` or ' +
      '`RECIPE_ABOVE_SHARE`, each with the rule, its index and the counts in elements. ' +
      'Always warnings; none blocks publishing. Empty under an empty recipe.',
  })
  recipeIssues!: RecipeIssue[];

  static from(module: ModuleCoverage): ModuleCoverageDto {
    const dto = new ModuleCoverageDto();
    dto.containerId = module.containerId;
    dto.title = module.title;
    dto.coverage = CoverageTalliesDto.from(module.coverage);
    dto.issues = module.issues;
    dto.recipeIssues = module.recipeIssues;
    return dto;
  }
}

class CoverageReportDto {
  @ApiProperty({ enum: ['draft', 'published'] })
  version!: string;

  @ApiProperty({
    example: true,
    description:
      'False when the container has no such version. A course nobody has published has no ' +
      'published coverage, which is a different statement from a course full of zeroes.',
  })
  available!: boolean;

  @ApiProperty({ type: CoverageTalliesDto })
  coverage!: CoverageTalliesDto;

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description:
      'Remarks about the balance, as codes and the numbers their message needs — never ' +
      'prose, because the authoring UI renders them in four languages. Every remark is a ' +
      'warning or a note; none of them blocks publishing.',
  })
  issues!: CoverageIssue[];

  @ApiProperty({ type: [ModuleCoverageDto] })
  modules!: ModuleCoverageDto[];

  static from(report: CoverageReport): CoverageReportDto {
    const dto = new CoverageReportDto();
    dto.version = report.version;
    dto.available = report.available;
    dto.coverage = CoverageTalliesDto.from(report.coverage);
    dto.issues = report.issues;
    dto.modules = report.modules.map((module) => ModuleCoverageDto.from(module));
    return dto;
  }
}

export class ContainerCoverageResponseDto {
  @ApiProperty()
  containerId!: string;

  @ApiProperty({ example: 'course' })
  containerType!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({
    type: RecipeDto,
    description:
      'The recipe the lessons were checked against — the course’s own, else its ' +
      'workspace’s, else empty',
  })
  recipe!: Recipe;

  @ApiPropertyOptional({ type: CoverageReportDto, nullable: true })
  draft!: CoverageReportDto | null;

  @ApiPropertyOptional({ type: CoverageReportDto, nullable: true })
  published!: CoverageReportDto | null;

  @ApiProperty({
    example: false,
    description:
      'Whether the draft and the published version disagree about what this container ' +
      'trains. Decided here rather than by the caller, so that the web editor, the mobile ' +
      'app and every later consumer do not each answer it by their own slightly different ' +
      'rule. Always false unless `version=both` and both versions exist.',
  })
  diverges!: boolean;

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description:
      'The cells that differ, as `{ axis, key, draft, published }`. Empty unless `diverges`.',
  })
  differences!: CoverageDifference[];

  static from(result: ContainerCoverageResult): ContainerCoverageResponseDto {
    const dto = new ContainerCoverageResponseDto();
    dto.containerId = result.containerId;
    dto.containerType = result.containerType;
    dto.title = result.title;
    dto.recipe = result.recipe;
    dto.draft = result.draft ? CoverageReportDto.from(result.draft) : null;
    dto.published = result.published ? CoverageReportDto.from(result.published) : null;
    dto.diverges = result.diverges;
    dto.differences = result.differences;
    return dto;
  }
}
