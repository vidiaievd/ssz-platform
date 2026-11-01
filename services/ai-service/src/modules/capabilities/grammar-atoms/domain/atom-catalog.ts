import type { AiFeedbackAtomRef } from '@ssz/contracts';
import type { GatewayRequest } from '../../../gateway/application/model-router.js';

/**
 * The grammar atoms a model may point a mistake at (plan 85, step 3): the atoms of the
 * course the learner has reached (learning-service, step 1), named as content-service
 * names them (step 2). An atom outside it is one the learner has not met — an error there
 * is the course's business, not the schedule's.
 */
export interface AtomCatalogEntry {
  atomId: string;
  /** `in_queue` — the learner has a card for it; `covered` — reached, no card (step 1). */
  status: 'in_queue' | 'covered';
  /** The rule, in the school's explanation language where an explanation has one. */
  ruleTitle: string;
  /** The point inside the rule, as the author wrote it. */
  title: string;
  description: string | null;
}

export type AtomCatalog = readonly AtomCatalogEntry[];

export const EMPTY_CATALOG: AtomCatalog = [];

/**
 * The longest line-up a prompt carries. Forty rule points is several units of a course; a
 * learner who has reached more has the ones in their queue first, which are the ones a flag
 * moves anything for.
 */
export const MAX_CATALOG_ATOMS = 40;

/** The aspects whose remarks are about a rule of grammar — the only ones that name an atom. */
export const GRAMMAR_ASPECTS: ReadonlySet<string> = new Set(['grammar', 'order']);

/** What the system prompt says about the catalogue; nothing when it is empty. */
export function catalogPromptLines(catalog: AtomCatalog): string[] {
  if (catalog.length === 0) return [];
  return [
    '',
    'Grammar rules this learner has already met in the course, one rule point per line',
    '(`atomId` — rule: point — note):',
    ...catalog.map(
      (atom) => `- ${atom.atomId} — ${atom.ruleTitle}: ${atom.title}${atom.description ? ` — ${atom.description}` : ''}`,
    ),
    '- `atomId`: on a grammar remark, the id of the rule point above that the error breaks, copied',
    '  exactly. Null when no point fits exactly, when the remark is not about grammar, or when unsure.',
    '  Never an id that is not in this list.',
  ];
}

/**
 * The request with the catalogue in it: the line-up at the end of the system prompt and a
 * required, nullable `atomId` on every remark. Unchanged when the catalogue is empty, so a
 * learner who has reached nothing is asked exactly what the version before asked.
 *
 * Not an enum of the ids: the schema guard would refuse the whole answer over one invented
 * id, and an invented id is dropped instead (plan 85 §1, rule 4 — see `atomRefOf`).
 */
export function withAtomCatalog(request: GatewayRequest, catalog: AtomCatalog): GatewayRequest {
  if (catalog.length === 0 || !request.responseSchema) return request;
  const schema = request.responseSchema.schema as {
    properties: { items: { items: { required: string[]; properties: Record<string, unknown> } } };
  };
  const remark = schema.properties.items.items;
  return {
    ...request,
    system: [request.system ?? '', ...catalogPromptLines(catalog)].join('\n'),
    responseSchema: {
      ...request.responseSchema,
      schema: {
        ...schema,
        properties: {
          ...schema.properties,
          items: {
            ...schema.properties.items,
            items: {
              ...remark,
              required: [...remark.required, 'atomId'],
              properties: {
                ...remark.properties,
                atomId: {
                  type: ['string', 'null'],
                  description: 'Id of the rule point from the list in the instructions that the error breaks; null when none fits',
                },
              },
            },
          },
        },
      },
    },
  };
}

/** A remark's atom: an id from the catalogue on a grammar remark, else none. */
export function atomRefOf(atomId: unknown, aspect: string, catalog: AtomCatalog): AiFeedbackAtomRef | null {
  if (typeof atomId !== 'string' || !GRAMMAR_ASPECTS.has(aspect)) return null;
  return catalog.some((atom) => atom.atomId === atomId) ? { atomType: 'grammar_rule_atom', atomId } : null;
}

/**
 * `atomRefOf` plus where the learner stands with the atom and its names — what a rehearsal
 * shows beside the remark (plan 85, step 7). Not for a teacher's draft: the engine's draft
 * schema takes `atomType` and `atomId` only.
 */
export function describedAtomRefOf(
  atomId: unknown,
  aspect: string,
  catalog: AtomCatalog,
): AiFeedbackAtomRef | null {
  const ref = atomRefOf(atomId, aspect, catalog);
  const entry = ref && catalog.find((atom) => atom.atomId === ref.atomId);
  if (!ref || !entry) return null;
  return { ...ref, status: entry.status, ruleTitle: entry.ruleTitle, title: entry.title };
}
