import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { itemsOf, matchWord } from '@ssz/shared-kernel/exercise-items';
import { GetTargetSuggestionsQuery } from './get-target-suggestions.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ExerciseDomainError } from '../../../domain/exceptions/exercise-domain.exceptions.js';
import { AtomType, TargetRole } from '../../../domain/value-objects/atom-type.vo.js';
import { EXERCISE_REPOSITORY } from '../../../domain/repositories/exercise.repository.interface.js';
import type { IExerciseRepository } from '../../../domain/repositories/exercise.repository.interface.js';
import { EXERCISE_ITEM_TARGET_REPOSITORY } from '../../../domain/repositories/exercise-item-target.repository.interface.js';
import type { IExerciseItemTargetRepository } from '../../../domain/repositories/exercise-item-target.repository.interface.js';

export type SuggestionReason =
  /** The gap answers this word, spelled as the vocabulary list spells it. */
  | 'word_exact'
  /** The gap answers a form of this word — `stillingsannonser` for `stillingsannonse`. */
  | 'word_inflected'
  /** The exercise practises a rule that has exactly one atom, so there is no ambiguity. */
  | 'rule_single_atom'
  /** The exercise practises a rule with several atoms; which one is the author's call. */
  | 'rule_candidate';

export interface TargetSuggestion {
  atomType: string;
  atomId: string;
  title: string;
  track: string;
  role: string;
  reason: SuggestionReason;
  /** False where the author has to choose between several equally possible atoms. */
  confident: boolean;
}

export interface ItemSuggestions {
  itemKey: string | null;
  label: string | null;
  /** True when this item already carries targets — a suggestion would overwrite them. */
  alreadyAddressed: boolean;
  suggestions: TargetSuggestion[];
}

export interface TargetSuggestionsView {
  exerciseId: string;
  templateCode: string;
  items: ItemSuggestions[];
  /**
   * Rules this exercise practises that nobody has cut into atoms yet. The one actionable
   * thing an author can be told when the suggestion list is otherwise empty, and it would be
   * invisible if such rules were simply skipped.
   */
  rulesWithoutAtoms: Array<{ ruleId: string; title: string }>;
}

/**
 * What this exercise is probably about, item by item — plan 63, phase 1.
 *
 * The catalogue does not have to be addressed by hand, because the exercise level is already
 * recorded: `PRACTICED_BY` relations and grammar pools have been filled by the seed and the
 * authoring panel all along, and on the dev corpus they answer for roughly half of it. What
 * is missing is *which piece* of the exercise each known atom belongs to, and that is what
 * the matching below decides.
 *
 * Every suggestion is a proposal an author confirms. Nothing here writes.
 */
@QueryHandler(GetTargetSuggestionsQuery)
export class GetTargetSuggestionsHandler implements IQueryHandler<
  GetTargetSuggestionsQuery,
  Result<TargetSuggestionsView, ExerciseDomainError>
> {
  constructor(
    @Inject(EXERCISE_REPOSITORY)
    private readonly exerciseRepo: IExerciseRepository,
    @Inject(EXERCISE_ITEM_TARGET_REPOSITORY)
    private readonly targetRepo: IExerciseItemTargetRepository,
  ) {}

  async execute(
    query: GetTargetSuggestionsQuery,
  ): Promise<Result<TargetSuggestionsView, ExerciseDomainError>> {
    const exercise = await this.exerciseRepo.findById(query.exerciseId);
    if (!exercise || exercise.deletedAt !== null) {
      return Result.fail(ExerciseDomainError.EXERCISE_NOT_FOUND);
    }

    const [candidates, existing] = await Promise.all([
      this.targetRepo.findCandidateAtoms(query.exerciseId),
      this.targetRepo.findByExerciseId(query.exerciseId),
    ]);
    const addressed = new Set(existing.map((target) => target.itemKey));

    const documentItems = itemsOf(
      exercise.templateCode,
      exercise.authoringContent,
      exercise.authoringExpectedAnswers,
    );

    // A rule is attached to the exercise, so its atoms apply to every item of it — a grammar
    // exercise practises its rule throughout, not in one gap. Where the rule has exactly one
    // atom there is nothing to choose and the suggestion is confident; where it has several,
    // they are offered and the author picks.
    const grammarSuggestions = candidates.grammarAtoms.map((atom) => ({
      atomType: AtomType.GRAMMAR_RULE_ATOM as string,
      atomId: atom.atomId,
      title: atom.title,
      track: atom.track,
      role: TargetRole.FOCUS as string,
      reason: (countAtomsOfRule(candidates.grammarAtoms, atom.ruleId) === 1
        ? 'rule_single_atom'
        : 'rule_candidate') as SuggestionReason,
      confident: countAtomsOfRule(candidates.grammarAtoms, atom.ruleId) === 1,
    }));

    // Whether a word is what the item *tests* or merely what it required depends on whether
    // grammar is also in play. A gap in a grammar drill answers a word the learner was not
    // examined on; the same gap in a vocabulary exercise is examining exactly that word.
    const wordRole =
      candidates.grammarAtoms.length > 0 || candidates.rulesWithoutAtoms.length > 0
        ? TargetRole.CONTEXT
        : TargetRole.FOCUS;

    if (documentItems === null) {
      // Nothing to point inside: everything known about the exercise applies to it as a whole.
      return Result.ok({
        exerciseId: exercise.id,
        templateCode: exercise.templateCode,
        items: [
          {
            itemKey: null,
            label: null,
            alreadyAddressed: addressed.has(null),
            suggestions: [
              ...grammarSuggestions,
              ...candidates.words.map((word) => ({
                atomType: AtomType.VOCABULARY_ITEM as string,
                atomId: word.atomId,
                title: word.word,
                track: 'lexis',
                role: wordRole as string,
                reason: 'word_exact' as SuggestionReason,
                // The exercise is known to practise the word; which part of it is not a
                // question this template can answer.
                confident: true,
              })),
            ],
          },
        ],
        rulesWithoutAtoms: candidates.rulesWithoutAtoms,
      });
    }

    const items: ItemSuggestions[] = documentItems.map((item) => {
      const wordSuggestions: TargetSuggestion[] = [];
      for (const word of candidates.words) {
        // Any surface form the piece offers: a gap has one, a pair has both its halves,
        // and which half of a pair holds the word is not fixed in the seeded corpus.
        const match = item.matchValues
          .map((surface) => matchWord(word.word, surface))
          .find((outcome) => outcome !== null);
        if (match === undefined || match === null) continue;
        wordSuggestions.push({
          atomType: AtomType.VOCABULARY_ITEM,
          atomId: word.atomId,
          title: word.word,
          track: 'lexis',
          role: wordRole,
          reason: match === 'exact' ? 'word_exact' : 'word_inflected',
          // One word matching one gap is as certain as this gets; two words matching the
          // same gap means the list holds near-duplicates and the author should look.
          confident: true,
        });
      }
      if (wordSuggestions.length > 1) {
        for (const suggestion of wordSuggestions) suggestion.confident = false;
      }

      return {
        itemKey: item.key,
        label: item.label,
        alreadyAddressed: addressed.has(item.key),
        suggestions: [...wordSuggestions, ...grammarSuggestions],
      };
    });

    return Result.ok({
      exerciseId: exercise.id,
      templateCode: exercise.templateCode,
      items,
      rulesWithoutAtoms: candidates.rulesWithoutAtoms,
    });
  }
}

function countAtomsOfRule(atoms: Array<{ ruleId: string }>, ruleId: string): number {
  return atoms.filter((atom) => atom.ruleId === ruleId).length;
}
