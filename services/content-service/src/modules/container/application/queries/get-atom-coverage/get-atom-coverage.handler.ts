import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { MODALITIES } from '@ssz/shared-kernel/skills';
import type { Modality } from '@ssz/shared-kernel/skills';
import { GetAtomCoverageQuery } from './get-atom-coverage.query.js';
import type { AtomCoverageVersionScope } from './get-atom-coverage.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { EXERCISE_AXES } from '../../../../../shared/skills/domain/exercise-axes.port.js';
import type { IExerciseAxes } from '../../../../../shared/skills/domain/exercise-axes.port.js';
import { AtomType, TargetRole } from '../../../../exercise/domain/value-objects/atom-type.vo.js';
import { AtomTrack } from '../../../../grammar-rule/domain/value-objects/atom-track.vo.js';

/**
 * Where the scope says a learner meets this fact for the first time.
 *
 * Four sources, kept apart rather than folded into a boolean, because they are four
 * different strengths of claim. A glossary mark or a text span is the lesson itself
 * saying "this word is in this text"; a relation is an author's statement about the
 * unit; a pool entry only says the unit drills the rule somewhere.
 */
export type AtomIntroductionSource = 'relation' | 'glossary' | 'text_span' | 'exercise_pool';

/** One count per modality, every key present — a zero here is the report's main product. */
export type ModalityTally = Record<Modality, number>;

export interface AtomCoverageEntry {
  atomType: string;
  atomId: string;
  title: string;
  track: string;
  /** The rule a grammar atom belongs to. Null for a word, which belongs to no rule. */
  parentId: string | null;
  parentTitle: string | null;
  /**
   * Empty for an atom this scope only practises. Such an atom is not a gap in the scope —
   * it is revision of something introduced elsewhere — and it is excluded from every
   * "untested" count below for exactly that reason.
   */
  introducedBy: AtomIntroductionSource[];
  /** Exercises of this scope naming the atom, in either role. */
  exercises: number;
  /** Items naming it as what they test. The number that decides `untested`. */
  focusItems: number;
  /** Items that merely required it — the word inside a gap testing an ending. */
  contextItems: number;
  /**
   * Focus items by the modality of the exercise they sit in. Context is left out on
   * purpose: an item the learner was not examined on says nothing about how they know it.
   */
  byModality: ModalityTally;
}

export type AtomIssueCode =
  /** Introduced here and no item of this scope tests it. */
  | 'atom_untested'
  /** Named by items, never as what they test. Required, never examined. */
  | 'atom_context_only'
  /** Tested, but every item that tests it is the same modality. */
  | 'atom_single_modality'
  /** Tested only by exercises whose modality nothing has judged — the report cannot say. */
  | 'atom_unknown_modality'
  /** A rule this scope introduces or drills that nobody has cut into atoms. */
  | 'rule_without_atoms'
  /** Not one item in the whole scope asks the learner to produce language. */
  | 'scope_no_production'
  /** Exercises here carry no targets at all — the findings above are mostly ignorance. */
  | 'scope_unaddressed_exercises';

export interface AtomCoverageIssue {
  code: AtomIssueCode;
  severity: 'warning' | 'note';
  atomType?: string;
  atomId?: string;
  title?: string;
  ruleId?: string;
  modality?: Modality;
  count?: number;
  total?: number;
}

export interface AtomCoverageSummary {
  /** Atoms this scope introduces, whether or not anything tests them. */
  introduced: number;
  introducedByTrack: Record<string, number>;
  /** Of those, the ones some item of this scope tests. */
  tested: number;
  untested: number;
  contextOnly: number;
  singleModality: number;
  /** Atoms practised here but introduced somewhere else. Not counted as gaps. */
  practisedElsewhere: number;
  /** Focus items across the scope, by modality. Zeroes included and load-bearing. */
  byModality: ModalityTally;
  exercises: number;
  /**
   * Exercises carrying at least one target. Printed beside every finding above because
   * it is what makes them readable: six untested words out of twenty-four means one thing
   * when every exercise is addressed and nothing at all when three of forty are.
   */
  exercisesAddressed: number;
}

export interface AtomCoverageScope {
  containerId: string;
  title: string;
  summary: AtomCoverageSummary;
  issues: AtomCoverageIssue[];
}

export interface AtomCoverageResult {
  containerId: string;
  containerType: string;
  title: string;
  version: AtomCoverageVersionScope;
  /** False when there is no such version — not a container that teaches nothing. */
  available: boolean;
  summary: AtomCoverageSummary;
  issues: AtomCoverageIssue[];
  /** Every atom of the scope, introduced or merely practised, ordered worst first. */
  atoms: AtomCoverageEntry[];
  /** Rules with nothing cut, named rather than silently contributing no atoms. */
  rulesWithoutAtoms: Array<{ ruleId: string; title: string }>;
  /** Direct children, summarised. Their atom lists come from asking about them. */
  units: AtomCoverageScope[];
}

/** What a walk of one scope reaches. */
interface Composition {
  containerIds: Set<string>;
  lessonIds: Set<string>;
  exerciseIds: Set<string>;
}

const EMPTY_TALLY = (): ModalityTally =>
  Object.fromEntries(MODALITIES.map((modality) => [modality, 0])) as ModalityTally;

/**
 * What this course teaches against what it ever asks — plan 63, phase 4.2.
 *
 * The skill coverage report beside it counts exercises by channel and subject. This one
 * counts *facts*: the words a unit's texts introduce and the atoms of the rules it teaches,
 * against the items that name them. It is the only thing that can say "this lesson
 * introduces twenty-four words, six of which no exercise ever asks about, and both of its
 * rules are only ever tested by picking an answer off a list".
 *
 * Every zero is printed. A lesson with no production item at all is the most useful
 * sentence this report can produce, and it is indistinguishable from a missing key if the
 * key is dropped (plan 55 §3.10).
 *
 * The composition walk is its own rather than shared with the skill report: that one needs
 * exercises, this one also needs the lessons whose glossaries introduce the words and the
 * containers whose relations name them. A pure read, nothing stored, no cache — for the
 * same reasons given there.
 */
@QueryHandler(GetAtomCoverageQuery)
export class GetAtomCoverageHandler implements IQueryHandler<
  GetAtomCoverageQuery,
  Result<AtomCoverageResult, ContainerDomainError>
> {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EXERCISE_AXES)
    private readonly axes: IExerciseAxes,
  ) {}

  async execute(
    query: GetAtomCoverageQuery,
  ): Promise<Result<AtomCoverageResult, ContainerDomainError>> {
    const container = await this.prisma.container.findFirst({
      where: { id: query.containerId, deletedAt: null },
      select: { id: true, title: true, containerType: true },
    });
    if (!container) return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);

    const versionId = await this.versionId(query.containerId, query.version);
    if (versionId === null) {
      return Result.ok({
        containerId: container.id,
        containerType: container.containerType,
        title: container.title,
        version: query.version,
        available: false,
        summary: emptySummary(),
        issues: [],
        atoms: [],
        rulesWithoutAtoms: [],
        units: [],
      });
    }

    const whole = await this.report(query.containerId, query.version);

    // Direct children, so a course can name the unit a finding belongs to. Their atom
    // lists are not repeated here: asking about a unit is one request away, and a course
    // of twenty units would otherwise answer with twenty copies of the same atoms.
    const items = await this.prisma.containerItem.findMany({
      where: { containerVersionId: versionId },
      orderBy: [{ position: 'asc' }],
      select: { itemType: true, itemId: true },
    });

    const units: AtomCoverageScope[] = [];
    for (const item of items) {
      if (item.itemType !== 'CONTAINER') continue;
      const child = await this.prisma.container.findFirst({
        where: { id: item.itemId, deletedAt: null },
        select: { id: true, title: true },
      });
      if (!child) continue;
      const childReport = await this.report(child.id, query.version);
      units.push({
        containerId: child.id,
        title: child.title,
        summary: childReport.summary,
        issues: childReport.issues,
      });
    }

    return Result.ok({
      containerId: container.id,
      containerType: container.containerType,
      title: container.title,
      version: query.version,
      available: true,
      summary: whole.summary,
      issues: whole.issues,
      atoms: whole.atoms,
      rulesWithoutAtoms: whole.rulesWithoutAtoms,
      units,
    });
  }

  private async report(
    containerId: string,
    version: AtomCoverageVersionScope,
  ): Promise<{
    summary: AtomCoverageSummary;
    issues: AtomCoverageIssue[];
    atoms: AtomCoverageEntry[];
    rulesWithoutAtoms: Array<{ ruleId: string; title: string }>;
  }> {
    const composition: Composition = {
      containerIds: new Set(),
      lessonIds: new Set(),
      exerciseIds: new Set(),
    };
    await this.collectContainer(containerId, version, composition, new Set());

    const { wordIds, ruleIds, sources } = await this.introduced(composition, version);
    const targets = await this.targets(composition);

    // Atoms arrive from two directions and the union is the list: what the scope says it
    // teaches, and what its items actually name. The second can reach outside the first —
    // revision of an earlier unit — and that is reported, not counted as a gap.
    for (const target of targets) {
      if (target.atomType === AtomType.VOCABULARY_ITEM) wordIds.add(target.atomId);
    }

    const [words, rules] = await Promise.all([this.words(wordIds), this.rules(ruleIds, targets)]);

    const entries: AtomCoverageEntry[] = [];
    for (const word of words) {
      entries.push(
        this.entry(
          {
            atomType: AtomType.VOCABULARY_ITEM,
            atomId: word.id,
            title: word.word,
            track: AtomTrack.LEXIS,
            parentId: null,
            parentTitle: null,
          },
          sources,
          targets,
        ),
      );
    }
    for (const rule of rules.withAtoms) {
      for (const atom of rule.atoms) {
        entries.push(
          this.entry(
            {
              atomType: AtomType.GRAMMAR_RULE_ATOM,
              atomId: atom.id,
              title: atom.title,
              track: atom.track === 'LEXIS' ? AtomTrack.LEXIS : AtomTrack.GRAMMAR,
              parentId: rule.id,
              parentTitle: rule.title,
            },
            // A grammar atom inherits its rule's introduction: the unit introduces the
            // rule, and the atoms are the pieces of it. The alternative — demanding that
            // every atom be named in a text span — would report a freshly cut rule as
            // teaching nothing.
            sources,
            targets,
            rule.id,
          ),
        );
      }
    }

    entries.sort(worstFirst);

    const summary = summarise(entries, composition, targets);
    const issues = issuesOf(entries, summary, rules.withoutAtoms);

    return { summary, issues, atoms: entries, rulesWithoutAtoms: rules.withoutAtoms };
  }

  private entry(
    atom: {
      atomType: AtomType;
      atomId: string;
      title: string;
      track: AtomTrack;
      parentId: string | null;
      parentTitle: string | null;
    },
    sources: Map<string, Set<AtomIntroductionSource>>,
    targets: ResolvedTarget[],
    /** Grammar atoms are introduced through their rule, so that is the key to look up. */
    sourceKey?: string,
  ): AtomCoverageEntry {
    const mine = targets.filter(
      (target) => target.atomType === atom.atomType && target.atomId === atom.atomId,
    );
    const byModality = EMPTY_TALLY();
    const exercises = new Set<string>();
    let focusItems = 0;
    let contextItems = 0;

    for (const target of mine) {
      exercises.add(target.exerciseId);
      if (target.role === TargetRole.FOCUS) {
        focusItems += 1;
        byModality[target.modality] += 1;
      } else {
        contextItems += 1;
      }
    }

    return {
      atomType: atom.atomType,
      atomId: atom.atomId,
      title: atom.title,
      track: atom.track,
      parentId: atom.parentId,
      parentTitle: atom.parentTitle,
      introducedBy: [...(sources.get(sourceKey ?? atom.atomId) ?? [])],
      exercises: exercises.size,
      focusItems,
      contextItems,
      byModality,
    };
  }

  /**
   * Which version of a container this scope means — the same rule as the skill report,
   * fallback included: a module nobody has touched has no draft of its own, and without
   * the fallback every one of them would report a course that introduces nothing.
   */
  private async versionId(
    containerId: string,
    version: AtomCoverageVersionScope,
  ): Promise<string | null> {
    const container = await this.prisma.container.findFirst({
      where: { id: containerId, deletedAt: null },
      select: { currentPublishedVersionId: true },
    });
    if (!container) return null;
    if (version === 'published') return container.currentPublishedVersionId;

    const draft = await this.prisma.containerVersion.findFirst({
      where: { containerId, status: 'DRAFT' },
      orderBy: [{ versionNumber: 'desc' }],
      select: { id: true },
    });
    return draft?.id ?? container.currentPublishedVersionId;
  }

  private async collectContainer(
    containerId: string,
    version: AtomCoverageVersionScope,
    into: Composition,
    visited: Set<string>,
  ): Promise<void> {
    if (visited.has(containerId)) return;
    visited.add(containerId);
    into.containerIds.add(containerId);

    const versionId = await this.versionId(containerId, version);
    if (versionId === null) return;

    const items = await this.prisma.containerItem.findMany({
      where: { containerVersionId: versionId },
      select: { itemType: true, itemId: true },
    });

    for (const item of items) {
      if (item.itemType === 'CONTAINER') {
        await this.collectContainer(item.itemId, version, into, visited);
      } else if (item.itemType === 'EXERCISE') {
        into.exerciseIds.add(item.itemId);
      } else if (item.itemType === 'LESSON') {
        into.lessonIds.add(item.itemId);
      }
    }
  }

  /**
   * The atoms the scope teaches, and where it says so.
   *
   * The lesson variants are read once, for three things at once: the exercises bolted onto
   * them (listening stages and the video question, which the skill report also counts),
   * the glossary marks, and the text spans. Reading them three times would be three walks
   * of the same rows.
   */
  private async introduced(
    composition: Composition,
    version: AtomCoverageVersionScope,
  ): Promise<{
    wordIds: Set<string>;
    ruleIds: Set<string>;
    sources: Map<string, Set<AtomIntroductionSource>>;
  }> {
    const wordIds = new Set<string>();
    const ruleIds = new Set<string>();
    const sources = new Map<string, Set<AtomIntroductionSource>>();
    const note = (id: string, source: AtomIntroductionSource): void => {
      const set = sources.get(id) ?? new Set<AtomIntroductionSource>();
      set.add(source);
      sources.set(id, set);
    };

    const lessonIds = [...composition.lessonIds];
    const variants =
      lessonIds.length === 0
        ? []
        : await this.prisma.lessonContentVariant.findMany({
            where: {
              lessonId: { in: lessonIds },
              deletedAt: null,
              ...(version === 'published' ? { status: 'PUBLISHED' } : {}),
            },
            select: {
              listeningStages: { select: { exerciseId: true } },
              videoQuestion: { select: { exerciseId: true } },
              glossaryMarks: { select: { vocabularyItemId: true } },
              textSpans: { select: { kind: true, refId: true } },
            },
          });

    for (const variant of variants) {
      for (const stage of variant.listeningStages) composition.exerciseIds.add(stage.exerciseId);
      if (variant.videoQuestion) composition.exerciseIds.add(variant.videoQuestion.exerciseId);

      for (const mark of variant.glossaryMarks) {
        wordIds.add(mark.vocabularyItemId);
        note(mark.vocabularyItemId, 'glossary');
      }
      for (const span of variant.textSpans) {
        if (span.refId === null) continue;
        if (span.kind === 'VOCAB') {
          wordIds.add(span.refId);
          note(span.refId, 'text_span');
        } else if (span.kind === 'GRAMMAR') {
          ruleIds.add(span.refId);
          note(span.refId, 'text_span');
        }
      }
    }

    // What an author stated outright, at either level: a unit introduces a word, or the
    // lesson inside it does. Both are the same claim about the same scope.
    const relations = await this.prisma.contentRelation.findMany({
      where: {
        relationKind: 'INTRODUCES',
        targetType: { in: ['VOCABULARY_ITEM', 'GRAMMAR_RULE'] },
        OR: [
          { sourceType: 'CONTAINER', sourceId: { in: [...composition.containerIds] } },
          ...(lessonIds.length === 0
            ? []
            : [{ sourceType: 'LESSON' as const, sourceId: { in: lessonIds } }]),
        ],
      },
      select: { targetType: true, targetId: true },
    });

    for (const relation of relations) {
      if (relation.targetType === 'VOCABULARY_ITEM') wordIds.add(relation.targetId);
      else ruleIds.add(relation.targetId);
      note(relation.targetId, 'relation');
    }

    // The weakest of the four, and worth having: a rule whose drills sit in this unit is
    // taught here even when nobody wrote the relation down. It is also the case where the
    // report earns its keep — the rule is practised, and which atom each drill is about
    // is exactly what nobody has said.
    const exerciseIds = [...composition.exerciseIds];
    const pool =
      exerciseIds.length === 0
        ? []
        : await this.prisma.grammarRuleExercisePool.findMany({
            where: { exerciseId: { in: exerciseIds } },
            select: { grammarRuleId: true },
          });
    for (const entry of pool) {
      ruleIds.add(entry.grammarRuleId);
      note(entry.grammarRuleId, 'exercise_pool');
    }

    return { wordIds, ruleIds, sources };
  }

  /** Targets of the scope's exercises, each carrying the modality of the exercise it sits in. */
  private async targets(composition: Composition): Promise<ResolvedTarget[]> {
    const exerciseIds = [...composition.exerciseIds];
    if (exerciseIds.length === 0) return [];

    const rows = await this.prisma.exerciseItemTarget.findMany({
      where: { exerciseId: { in: exerciseIds } },
      select: { exerciseId: true, itemKey: true, atomType: true, atomId: true, role: true },
    });
    if (rows.length === 0) return [];

    const derived = await this.axes.forExercises(exerciseIds, 'live');

    return rows.map((row) => ({
      exerciseId: row.exerciseId,
      atomType:
        row.atomType === 'VOCABULARY_ITEM' ? AtomType.VOCABULARY_ITEM : AtomType.GRAMMAR_RULE_ATOM,
      atomId: row.atomId,
      role: row.role === 'FOCUS' ? TargetRole.FOCUS : TargetRole.CONTEXT,
      // `unknown` where the axis table has no judgement about the template — the honest
      // gap, and never folded into one of the three real modalities.
      modality: derived.get(row.exerciseId)?.modality ?? 'unknown',
    }));
  }

  private async words(ids: Set<string>): Promise<Array<{ id: string; word: string }>> {
    if (ids.size === 0) return [];
    return this.prisma.vocabularyItem.findMany({
      where: { id: { in: [...ids] }, deletedAt: null },
      select: { id: true, word: true },
      orderBy: { word: 'asc' },
    });
  }

  /**
   * The rules of the scope with their living atoms, plus the rules nobody has cut.
   *
   * Rules named by a target are read too: an item can address an atom of a rule this scope
   * never mentions, and leaving the rule unread would leave the atom nameless.
   */
  private async rules(
    ids: Set<string>,
    targets: ResolvedTarget[],
  ): Promise<{
    withAtoms: Array<{
      id: string;
      title: string;
      atoms: Array<{ id: string; title: string; track: string }>;
    }>;
    withoutAtoms: Array<{ ruleId: string; title: string }>;
  }> {
    const addressedAtomIds = targets
      .filter((target) => target.atomType === AtomType.GRAMMAR_RULE_ATOM)
      .map((target) => target.atomId);

    const extraRuleIds =
      addressedAtomIds.length === 0
        ? []
        : (
            await this.prisma.grammarRuleAtom.findMany({
              where: { id: { in: addressedAtomIds }, deletedAt: null },
              select: { grammarRuleId: true },
            })
          ).map((atom) => atom.grammarRuleId);

    const ruleIds = [...new Set([...ids, ...extraRuleIds])];
    if (ruleIds.length === 0) return { withAtoms: [], withoutAtoms: [] };

    const rules = await this.prisma.grammarRule.findMany({
      where: { id: { in: ruleIds }, deletedAt: null },
      orderBy: { title: 'asc' },
      select: {
        id: true,
        title: true,
        atoms: {
          where: { deletedAt: null },
          orderBy: { position: 'asc' },
          select: { id: true, title: true, track: true },
        },
      },
    });

    return {
      withAtoms: rules.filter((rule) => rule.atoms.length > 0),
      withoutAtoms: rules
        .filter((rule) => rule.atoms.length === 0)
        .map((rule) => ({ ruleId: rule.id, title: rule.title })),
    };
  }
}

interface ResolvedTarget {
  exerciseId: string;
  atomType: AtomType;
  atomId: string;
  role: TargetRole;
  modality: Modality;
}

function emptySummary(): AtomCoverageSummary {
  return {
    introduced: 0,
    introducedByTrack: { [AtomTrack.LEXIS]: 0, [AtomTrack.GRAMMAR]: 0 },
    tested: 0,
    untested: 0,
    contextOnly: 0,
    singleModality: 0,
    practisedElsewhere: 0,
    byModality: EMPTY_TALLY(),
    exercises: 0,
    exercisesAddressed: 0,
  };
}

/** Tested modalities, `unknown` excluded: it is the absence of a judgement, not one. */
function knownModalities(entry: AtomCoverageEntry): Modality[] {
  return MODALITIES.filter((modality) => modality !== 'unknown' && entry.byModality[modality] > 0);
}

/**
 * Worst first, so a report that is too long to read still opens on what to fix: atoms the
 * scope introduces and never tests, then the ones it only requires, then the ones it tests
 * one way, then everything else alphabetically.
 */
function worstFirst(a: AtomCoverageEntry, b: AtomCoverageEntry): number {
  const rank = (entry: AtomCoverageEntry): number => {
    const introduced = entry.introducedBy.length > 0;
    if (introduced && entry.focusItems === 0 && entry.contextItems === 0) return 0;
    if (introduced && entry.focusItems === 0) return 1;
    if (knownModalities(entry).length === 1) return 2;
    return 3;
  };
  const difference = rank(a) - rank(b);
  if (difference !== 0) return difference;
  return a.title.localeCompare(b.title);
}

function summarise(
  entries: AtomCoverageEntry[],
  composition: Composition,
  targets: ResolvedTarget[],
): AtomCoverageSummary {
  const summary = emptySummary();
  summary.exercises = composition.exerciseIds.size;
  summary.exercisesAddressed = new Set(targets.map((target) => target.exerciseId)).size;

  for (const entry of entries) {
    for (const modality of MODALITIES) summary.byModality[modality] += entry.byModality[modality];

    if (entry.introducedBy.length === 0) {
      summary.practisedElsewhere += 1;
      continue;
    }

    summary.introduced += 1;
    summary.introducedByTrack[entry.track] = (summary.introducedByTrack[entry.track] ?? 0) + 1;

    if (entry.focusItems > 0) {
      summary.tested += 1;
      if (knownModalities(entry).length === 1) summary.singleModality += 1;
    } else if (entry.contextItems > 0) {
      summary.contextOnly += 1;
    } else {
      summary.untested += 1;
    }
  }

  return summary;
}

function issuesOf(
  entries: AtomCoverageEntry[],
  summary: AtomCoverageSummary,
  rulesWithoutAtoms: Array<{ ruleId: string; title: string }>,
): AtomCoverageIssue[] {
  const issues: AtomCoverageIssue[] = [];

  // Said first, because it decides how the rest should be read: findings drawn from a
  // catalogue nobody has addressed are findings about the markup, not about the course.
  if (summary.exercises > 0 && summary.exercisesAddressed < summary.exercises) {
    issues.push({
      code: 'scope_unaddressed_exercises',
      severity: summary.exercisesAddressed === 0 ? 'warning' : 'note',
      count: summary.exercises - summary.exercisesAddressed,
      total: summary.exercises,
    });
  }

  for (const entry of entries) {
    if (entry.introducedBy.length === 0) continue;

    if (entry.focusItems === 0 && entry.contextItems === 0) {
      issues.push({ code: 'atom_untested', severity: 'warning', ...name(entry) });
      continue;
    }
    if (entry.focusItems === 0) {
      issues.push({ code: 'atom_context_only', severity: 'note', ...name(entry) });
      continue;
    }

    const known = knownModalities(entry);
    if (known.length === 0) {
      issues.push({ code: 'atom_unknown_modality', severity: 'note', ...name(entry) });
    } else if (known.length === 1) {
      issues.push({
        code: 'atom_single_modality',
        // A word only ever recognised is the finding this whole plan was built to
        // surface; a word only ever produced is a curiosity.
        severity: known[0] === 'recognition' ? 'warning' : 'note',
        modality: known[0],
        ...name(entry),
      });
    }
  }

  for (const rule of rulesWithoutAtoms) {
    issues.push({
      code: 'rule_without_atoms',
      severity: 'note',
      ruleId: rule.ruleId,
      title: rule.title,
    });
  }

  // Printed even when the scope tests nothing at all: "no production here" is true of a
  // unit with no items just as much as of a unit full of them, and a reader who is told
  // only about the second will assume the first was fine.
  if (summary.byModality.production === 0) {
    issues.push({ code: 'scope_no_production', severity: 'warning', count: 0 });
  }

  return issues;
}

function name(entry: AtomCoverageEntry): Pick<AtomCoverageIssue, 'atomType' | 'atomId' | 'title'> {
  return { atomType: entry.atomType, atomId: entry.atomId, title: entry.title };
}
