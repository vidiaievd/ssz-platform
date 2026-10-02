// Public surface of the skill axes — plan 55 phase 1.

export type { Focus, FocusSource, Form, Input, Modality, Output, Skill, SkillSource } from './model.js';
export {
  channelsOf,
  FOCUS_SOURCES,
  FOCUSES,
  FORMS,
  INPUTS,
  MODALITIES,
  OUTPUTS,
  isFocus,
  isInput,
  isModality,
  isOutput,
  isSkill,
  orderFocuses,
  orderSkills,
  parseFocuses,
  parseSkills,
  SKILL_SOURCES,
  SKILLS,
} from './model.js';

export type { TemplateProfile } from './by-template.js';
export { BY_TEMPLATE, templateProfile } from './by-template.js';

export type { AtomRef, DeriveInput, DerivedProfile, Placement, SkillOverride } from './derive.js';
export { deriveSkills } from './derive.js';

export type {
  Coverage,
  CoverageDifference,
  FocusTally,
  FormTally,
  ModalityTally,
  PairTally,
  SkillTally,
} from './coverage.js';
export { coverage, diff, diverges, share, tally } from './coverage.js';

export type { CoverageIssue, CoverageIssueLevel, CoverageIssueOptions } from './issues.js';
export { coverageIssues, warnings } from './issues.js';
