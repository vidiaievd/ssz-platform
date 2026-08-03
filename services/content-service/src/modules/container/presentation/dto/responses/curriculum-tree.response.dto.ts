import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  CurriculumTreeItemNode,
  CurriculumTreeSectionNode,
  CurriculumTreeModuleNode,
  CurriculumTreeLevelNode,
  CurriculumTreeResult,
} from '../../../application/queries/get-curriculum-tree/get-curriculum-tree.handler.js';

export class CurriculumTreeItemResponseDto {
  @ApiProperty({ example: 'uuid-of-container-item' })
  id!: string;

  @ApiProperty({
    example: 'lesson',
    enum: ['container', 'lesson', 'vocabulary_list', 'grammar_rule', 'exercise'],
  })
  itemType!: string;

  @ApiProperty({ example: 'uuid-of-lesson' })
  refId!: string;

  @ApiPropertyOptional({ example: 'En vanlig arbeidsdag' })
  title!: string | null;

  @ApiProperty({ example: 0 })
  position!: number;

  @ApiProperty({ example: true })
  isRequired!: boolean;

  @ApiPropertyOptional({ example: 'text', enum: ['text', 'video', 'audio', 'live'] })
  lessonKind!: string | null;

  @ApiPropertyOptional({ example: 'published', enum: ['draft', 'published'] })
  state!: string | null;

  @ApiPropertyOptional({
    example: false,
    description:
      "Whether the owning container's currently published version places this item — " +
      'i.e. whether a student can open it now. Null when that container has never been published.',
  })
  isLive!: boolean | null;

  @ApiPropertyOptional({ example: 6 })
  durationMinutes!: number | null;

  @ApiPropertyOptional({ example: 10 })
  xpReward!: number | null;

  static from(node: CurriculumTreeItemNode): CurriculumTreeItemResponseDto {
    const dto = new CurriculumTreeItemResponseDto();
    dto.id = node.id;
    dto.itemType = node.itemType;
    dto.refId = node.refId;
    dto.title = node.title;
    dto.position = node.position;
    dto.isRequired = node.isRequired;
    dto.lessonKind = node.lessonKind;
    dto.state = node.state;
    dto.isLive = node.isLive;
    dto.durationMinutes = node.durationMinutes;
    dto.xpReward = node.xpReward;
    return dto;
  }
}

export class CurriculumTreeSectionResponseDto {
  @ApiProperty({ example: 'uuid-of-section' })
  id!: string;

  @ApiProperty({ example: 'Reinforce & read' })
  title!: string;

  @ApiProperty({ example: 0 })
  position!: number;

  @ApiProperty({ type: () => CurriculumTreeItemResponseDto, isArray: true })
  items!: CurriculumTreeItemResponseDto[];

  static from(node: CurriculumTreeSectionNode): CurriculumTreeSectionResponseDto {
    const dto = new CurriculumTreeSectionResponseDto();
    dto.id = node.id;
    dto.title = node.title;
    dto.position = node.position;
    dto.items = node.items.map((i) => CurriculumTreeItemResponseDto.from(i));
    return dto;
  }
}

export class CurriculumTreeModuleResponseDto {
  @ApiProperty({ example: 'uuid-of-container-item' })
  id!: string;

  @ApiProperty({ example: 'uuid-of-module-container' })
  containerId!: string;

  @ApiPropertyOptional({ example: 'uuid-of-module-version' })
  versionId!: string | null;

  @ApiPropertyOptional({ example: 'Samfunn og kultur' })
  title!: string | null;

  @ApiPropertyOptional({ example: 'Society and culture' })
  titleEn!: string | null;

  @ApiProperty({ example: 0 })
  position!: number;

  @ApiProperty({ example: true })
  isRequired!: boolean;

  @ApiProperty({
    example: 'pending_changes',
    enum: ['draft', 'published', 'pending_changes'],
    description:
      'Whether the module is live and whether its draft composition differs from the live one',
  })
  publishState!: string;

  @ApiProperty({ type: () => CurriculumTreeSectionResponseDto, isArray: true })
  sections!: CurriculumTreeSectionResponseDto[];

  @ApiProperty({ type: () => CurriculumTreeItemResponseDto, isArray: true })
  ungroupedItems!: CurriculumTreeItemResponseDto[];

  static from(node: CurriculumTreeModuleNode): CurriculumTreeModuleResponseDto {
    const dto = new CurriculumTreeModuleResponseDto();
    dto.id = node.id;
    dto.containerId = node.containerId;
    dto.versionId = node.versionId;
    dto.title = node.title;
    dto.titleEn = node.titleEn;
    dto.position = node.position;
    dto.isRequired = node.isRequired;
    dto.publishState = node.publishState;
    dto.sections = node.sections.map((s) => CurriculumTreeSectionResponseDto.from(s));
    dto.ungroupedItems = node.ungroupedItems.map((i) => CurriculumTreeItemResponseDto.from(i));
    return dto;
  }
}

export class CurriculumTreeLevelResponseDto {
  @ApiPropertyOptional({ example: 'uuid-of-level-section' })
  id!: string | null;

  @ApiPropertyOptional({ example: 'A1 — Beginner' })
  title!: string | null;

  @ApiProperty({ example: 0 })
  position!: number;

  @ApiProperty({ type: () => CurriculumTreeModuleResponseDto, isArray: true })
  modules!: CurriculumTreeModuleResponseDto[];

  @ApiProperty({
    type: () => CurriculumTreeItemResponseDto,
    isArray: true,
    description:
      "Leaf items in this section of the requested container itself (a module's own material)",
  })
  items!: CurriculumTreeItemResponseDto[];

  static from(node: CurriculumTreeLevelNode): CurriculumTreeLevelResponseDto {
    const dto = new CurriculumTreeLevelResponseDto();
    dto.id = node.id;
    dto.title = node.title;
    dto.position = node.position;
    dto.modules = node.modules.map((m) => CurriculumTreeModuleResponseDto.from(m));
    dto.items = node.items.map((i) => CurriculumTreeItemResponseDto.from(i));
    return dto;
  }
}

export class CurriculumTreeResponseDto {
  @ApiProperty({ example: 'uuid-of-course-version' })
  versionId!: string;

  @ApiProperty({ example: 'uuid-of-course-container' })
  containerId!: string;

  @ApiProperty({ example: 'module', enum: ['course', 'module'] })
  containerType!: string;

  @ApiProperty({ example: 'cefr', enum: ['cefr', 'custom', 'single'] })
  levelSystem!: string;

  @ApiProperty({
    example: 'published',
    enum: ['draft', 'published', 'pending_changes'],
    description: 'Publish state of the course container itself',
  })
  publishState!: string;

  @ApiProperty({ type: () => CurriculumTreeLevelResponseDto, isArray: true })
  levels!: CurriculumTreeLevelResponseDto[];

  @ApiProperty({ type: () => CurriculumTreeItemResponseDto, isArray: true })
  ungroupedItems!: CurriculumTreeItemResponseDto[];

  static from(result: CurriculumTreeResult): CurriculumTreeResponseDto {
    const dto = new CurriculumTreeResponseDto();
    dto.versionId = result.versionId;
    dto.containerId = result.containerId;
    dto.containerType = result.containerType;
    dto.levelSystem = result.levelSystem;
    dto.publishState = result.publishState;
    dto.levels = result.levels.map((l) => CurriculumTreeLevelResponseDto.from(l));
    dto.ungroupedItems = result.ungroupedItems.map((i) => CurriculumTreeItemResponseDto.from(i));
    return dto;
  }
}
