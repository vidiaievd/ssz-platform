-- ─── SrsContentType gains GRAMMAR_ATOM (plan 63 phase 5) ─────────────────────
-- A review card may now point at one grammar rule atom, so that memory of a rule is
-- kept per atom rather than inferred from how often its exercises come back.
-- contentId is the GrammarRuleAtom id in content-service.
--
-- Written in shadow for now: the fan-out rates these cards beside the old ones, and
-- nothing shows them to a learner or counts them into a daily budget until the two
-- models have been compared (phase 7).
--
-- NOTE: the enum's DB-side value is the @map value, not the Prisma member name.

ALTER TYPE "srs_content_type" ADD VALUE IF NOT EXISTS 'grammar_atom';
