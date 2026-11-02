// A self-checked reference word (plan 88, step 6b.3): a cloud voice says the word in a carrier
// sentence, and ai-service checked its toneme against the lexicon before it came here.
//
// Its own kind: made once per word for the whole platform and kept for good — no lesson or
// attempt stands on it, so neither orphan sweep may take it (they list their kinds), and it is
// owned by the platform rather than the author who asked first. READY clips are readable by any
// authenticated user, like lesson media. `entityId` is the clip's key (`referenceClipKey`).
export const REFERENCE_CLIP = 'reference_clip';

/** The owner of what the platform makes for everyone; no account has this id. */
export const PLATFORM_OWNER_ID = '00000000-0000-0000-0000-000000000000';

export function isReferenceClip(entityType: string | null | undefined): boolean {
  return entityType === REFERENCE_CLIP;
}

/** One clip per language and word, whatever its case as written. */
export function referenceClipKey(lang: string, word: string): string {
  return `${lang.toLowerCase()}:${word.trim().toLowerCase()}`;
}
