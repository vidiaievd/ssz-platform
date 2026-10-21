import { Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

/**
 * A loop that runs `tick` every `intervalMs`, never two at once: a slow tick makes the
 * next one wait instead of piling up. A failing tick is logged and the loop goes on.
 */
export abstract class IntervalJob implements OnModuleInit, OnModuleDestroy {
  protected readonly logger = new Logger(this.constructor.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  protected constructor(private readonly intervalMs: number) {}

  protected abstract tick(): Promise<void>;

  onModuleInit(): void {
    if (process.env['NODE_ENV'] === 'test') return;
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs);
    this.logger.log(`Started (every ${this.intervalMs}ms)`);
  }

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.tick();
    } catch (err) {
      this.logger.error(`Tick failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.running = false;
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
