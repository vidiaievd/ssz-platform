/**
 * The check of an `information_transfer` blank as the student sees it (plan 73 §3.6) — after a
 * check, and again on a reload of a blank left open.
 *
 * An allowlist, for the reason `shortAnswerVerdicts` gives: the details are also the record the
 * exercise report reads — the first check's verdict and wording of every cell, the count of
 * cells the core could not read — and a field added to the record later must not leak by being
 * forgotten here. What travels is what the runner draws: each cell's value and verdict now,
 * the standard form or the key where the kernel let it out (`canonical`), the author's reason
 * for a cell not counted, the hint under the label; and over the blank the recorded score, the
 * pass mark, the missed required cells and the budget.
 *
 * None of it is key the check did not already decide to show: the kernel puts `canonical` on a
 * wrong cell only under `revealKey`.
 */
export function informationTransferLearnerDetails(details: unknown): unknown {
  if (typeof details !== 'object' || details === null) return undefined;
  const d = details as Record<string, unknown>;
  const items = Array.isArray(d['items']) ? (d['items'] as unknown[]) : [];

  return {
    totalItems: d['totalItems'],
    passedItems: d['passedItems'],
    correctNow: d['correctNow'],
    pct: d['pct'],
    passed: d['passed'],
    passPct: d['passPct'],
    missedRequired: d['missedRequired'],
    attempt: d['attempt'],
    checksLeft: d['checksLeft'],
    closed: d['closed'],
    revealed: d['revealed'],
    locked: d['locked'],
    items: items.map((raw) => {
      const item = (raw ?? {}) as Record<string, unknown>;
      return {
        itemId: item['itemId'],
        value: item['value'],
        verdict: item['verdict'],
        correct: item['correct'],
        ...(typeof item['canonical'] === 'string' ? { canonical: item['canonical'] } : {}),
        ...(typeof item['why'] === 'string' ? { why: item['why'] } : {}),
        ...(typeof item['hint'] === 'string' ? { hint: item['hint'] } : {}),
      };
    }),
  };
}

/** Whether the last check closed the blank — the moment the transcript is owed (§3.6). */
export function informationTransferClosed(details: unknown): boolean {
  return (
    typeof details === 'object' &&
    details !== null &&
    (details as { closed?: unknown }).closed === true
  );
}
