/**
 * Names for a batch of atom addresses.
 *
 * Analytics holds ids and nothing else — an address travels through the event stream as a
 * pair of strings — so any screen that reports about atoms has to ask this service what
 * they are called. The same reason `vocabulary-items/batch-display` exists for the SRS
 * queue, and the same shape: one round trip for a whole screenful.
 */
export class DescribeAtomsQuery {
  constructor(public readonly refs: ReadonlyArray<{ atomType: string; atomId: string }>) {}
}
