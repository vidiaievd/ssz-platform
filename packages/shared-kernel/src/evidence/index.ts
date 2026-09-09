// How much one answer actually proves — plan 36 §B.1, shared by the scheduler that
// clamps a rating and the projection that weighs the same attempt (plan 55 §3.9).

export type { AnswerForm, EvidenceInput, EvidenceStrength, ReviewRatingValue } from './evidence-strength.js';
export { clampByEvidence, evidenceStrength, ratingRank } from './evidence-strength.js';
