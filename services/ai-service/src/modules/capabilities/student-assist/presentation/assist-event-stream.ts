import type { Response } from 'express';
import type { AssistStream, AssistStreamEvent } from '../application/assist-loop.js';
import type { AssistRefusal } from '../application/assist-refusal.js';
import type { AssistAnswerDto } from './assist.dto.js';

/** How a streamed turn ends: the checked answer, a refusal, or nothing usable (R-f). */
export type AssistStreamEnd =
  | { kind: 'answer'; answer: AssistAnswerDto }
  | { kind: 'refused'; reason: AssistRefusal }
  | { kind: 'unavailable' };

/**
 * A streamed turn over server-sent events (plan 83, step 9). The response is committed only by
 * the first piece of text: until then nothing is written, so a turn that is rejected, refused or
 * silent before the model wrote anything is answered with its plain status and JSON, exactly as
 * without `stream` — the client handles one set of errors. Once committed, the turn ends with one
 * of `answer` / `refused` / `unavailable`, and the client keeps what it showed only on `answer`,
 * replacing it with the answer's blocks.
 *
 * `X-Accel-Buffering: no` keeps nginx from holding the events back (no gateway config needed).
 */
export class AssistEventStream implements AssistStream {
  private committed = false;
  private gone = false;

  constructor(private readonly res: Response) {
    res.on('close', () => {
      this.gone = true;
    });
  }

  /** Whether the response has been committed as an event stream. */
  get started(): boolean {
    return this.committed;
  }

  send(event: AssistStreamEvent): void {
    if (event.type === 'delta') this.write('delta', event.delta);
    // Before anything was sent there is nothing to void.
    else if (this.committed) this.write('reset', {});
  }

  closed(): boolean {
    return this.gone;
  }

  end(end: AssistStreamEnd): void {
    switch (end.kind) {
      case 'answer':
        this.write('answer', end.answer);
        break;
      case 'refused':
        this.write('refused', { reason: end.reason });
        break;
      case 'unavailable':
        this.write('unavailable', {});
        break;
    }
    if (!this.gone) this.res.end();
  }

  private write(event: string, data: unknown): void {
    if (this.gone) return;
    if (!this.committed) {
      this.committed = true;
      this.res.status(200);
      this.res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      this.res.setHeader('Cache-Control', 'no-cache, no-transform');
      this.res.setHeader('X-Accel-Buffering', 'no');
      this.res.flushHeaders();
    }
    this.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}
