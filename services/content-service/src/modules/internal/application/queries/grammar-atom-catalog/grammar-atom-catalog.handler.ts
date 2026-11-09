import { Inject, NotFoundException } from '@nestjs/common';
import { QueryBus, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { CACHE_SERVICE, type ICacheService } from '../../../../../shared/application/ports/cache.port.js';
import type { Result } from '../../../../../shared/kernel/result.js';
import { GetAtomCoverageQuery } from '../../../../container/application/queries/get-atom-coverage/get-atom-coverage.query.js';
import type { AtomCoverageResult } from '../../../../container/application/queries/get-atom-coverage/get-atom-coverage.handler.js';
import type { ContainerDomainError } from '../../../../container/domain/exceptions/container-domain.exceptions.js';
import { AtomType } from '../../../../exercise/domain/value-objects/atom-type.vo.js';
import { pickVariant, trimText } from '../assist-material/assist-material.projection.js';
import { GetGrammarAtomCatalogQuery } from './grammar-atom-catalog.query.js';

export interface GrammarAtomCatalogEntry {
  atomId: string;
  ruleId: string;
  /** The rule's explanation title in the asked language, else the rule's own title. */
  ruleTitle: string;
  /** As the author wrote it — atoms carry no translations; usually the target language. */
  title: string;
  /** One line of the author's note, or null. Not translated either. */
  description: string | null;
}

export interface GrammarAtomCatalog {
  courseId: string;
  language: string;
  atoms: GrammarAtomCatalogEntry[];
}

/** One line in a prompt line-up — the model needs a hint, not the note. */
const DESCRIPTION_CHARS = 160;

/**
 * Ten minutes. Nothing invalidates it on publish: a rule cut into atoms a few minutes ago
 * not yet being something a model can point at costs nothing, and the catalogue is read
 * once per reviewed piece of work.
 */
const CATALOG_TTL_SECONDS = 10 * 60;

const cacheKey = (courseId: string, language: string) =>
  `content:grammar-atom-catalog:${courseId}:${language}`;

/**
 * Every grammar atom of a course's published version — introduced or only practised —
 * with what a model needs to name it: plan 85, step 2.
 *
 * The course as a whole, not the learner: which of these a learner has reached is
 * learning-service's answer (step 1), and ai-service intersects the two. Cached per
 * course and language for that reason — one catalogue serves every learner.
 *
 * Built from the atom coverage report rather than from the rule leaves, so that it names
 * exactly the atoms learning-service can call reached; a rule reaches a unit through
 * relations, texts and pools far more often than as an item of its own.
 */
@QueryHandler(GetGrammarAtomCatalogQuery)
export class GetGrammarAtomCatalogHandler implements IQueryHandler<GetGrammarAtomCatalogQuery, GrammarAtomCatalog> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
  ) {}

  async execute(query: GetGrammarAtomCatalogQuery): Promise<GrammarAtomCatalog> {
    const key = cacheKey(query.courseId, query.language);
    const cached = await this.cache.get<GrammarAtomCatalog>(key);
    if (cached !== null) return cached;

    const coverage = await this.queryBus.execute<
      GetAtomCoverageQuery,
      Result<AtomCoverageResult, ContainerDomainError>
    >(new GetAtomCoverageQuery(query.courseId, 'published'));
    if (coverage.isFail) throw new NotFoundException(`Course ${query.courseId} not found`);

    const atomIds = coverage.value.atoms
      .filter((atom) => atom.atomType === AtomType.GRAMMAR_RULE_ATOM)
      .map((atom) => atom.atomId);

    const catalog: GrammarAtomCatalog = {
      courseId: query.courseId,
      language: query.language,
      atoms: atomIds.length === 0 ? [] : await this.entries(atomIds, query.language),
    };
    await this.cache.set(key, catalog, CATALOG_TTL_SECONDS);
    return catalog;
  }

  private async entries(atomIds: string[], language: string): Promise<GrammarAtomCatalogEntry[]> {
    const atoms = await this.prisma.grammarRuleAtom.findMany({
      where: { id: { in: atomIds }, deletedAt: null },
      orderBy: [{ grammarRuleId: 'asc' }, { position: 'asc' }],
      select: {
        id: true,
        grammarRuleId: true,
        title: true,
        description: true,
        grammarRule: {
          select: {
            title: true,
            explanations: {
              where: { status: 'PUBLISHED', deletedAt: null },
              select: { explanationLanguage: true, minLevel: true, displayTitle: true },
            },
          },
        },
      },
    });

    return atoms.map((atom) => {
      const explanation = pickVariant(
        atom.grammarRule.explanations.map((e) => ({ ...e, minLevel: String(e.minLevel) })),
        language,
      );
      const note = atom.description?.split('\n')[0]?.trim();
      return {
        atomId: atom.id,
        ruleId: atom.grammarRuleId,
        ruleTitle: explanation?.displayTitle || atom.grammarRule.title,
        title: atom.title,
        description: note ? trimText(note, DESCRIPTION_CHARS).text : null,
      };
    });
  }
}
