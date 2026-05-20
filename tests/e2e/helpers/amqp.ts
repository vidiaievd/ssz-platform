import { randomUUID } from 'node:crypto';
import amqp from 'amqplib';

const EXCHANGE = 'ssz.events';
const EXCHANGE_TYPE = 'topic';

export interface CapturedEvent<T = unknown> {
  eventId: string;
  eventType: string;
  timestamp: string;
  payload: T;
  version: number;
}

export class AmqpEventCapture {
  private connection!: amqp.Connection;
  private channel!: amqp.Channel;
  private captured: CapturedEvent[] = [];

  async connect(url: string, routingKeys: string[]): Promise<void> {
    this.connection = await amqp.connect(url);
    this.channel = await this.connection.createChannel();

    await this.channel.assertExchange(EXCHANGE, EXCHANGE_TYPE, { durable: true });
    const { queue } = await this.channel.assertQueue('', { exclusive: true, autoDelete: true });

    for (const key of routingKeys) {
      await this.channel.bindQueue(queue, EXCHANGE, key);
    }

    this.channel.consume(queue, (msg) => {
      if (!msg) return;
      try {
        const envelope = JSON.parse(msg.content.toString()) as CapturedEvent;
        this.captured.push(envelope);
      } catch {
        // malformed message — ignore
      }
      this.channel.ack(msg);
    });
  }

  async disconnect(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }

  /** Returns a copy of all captured events so far. */
  all(): CapturedEvent[] {
    return [...this.captured];
  }

  /** Waits until at least one event matching the predicate arrives, or rejects on timeout. */
  waitFor<T = unknown>(
    predicate: (e: CapturedEvent) => boolean,
    timeoutMs = 30_000,
  ): Promise<CapturedEvent<T>> {
    return new Promise((resolve, reject) => {
      const deadline = setTimeout(() => {
        reject(new Error(`AmqpEventCapture.waitFor timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const check = (): void => {
        const match = this.captured.find(predicate);
        if (match) {
          clearTimeout(deadline);
          resolve(match as CapturedEvent<T>);
          return;
        }
        setTimeout(check, 200);
      };

      check();
    });
  }

  /** Asserts that NO event matching the predicate was captured within the window. */
  async assertNone(predicate: (e: CapturedEvent) => boolean, windowMs = 3_000): Promise<void> {
    await new Promise((r) => setTimeout(r, windowMs));
    const match = this.captured.find(predicate);
    if (match) {
      throw new Error(`Unexpected event captured: ${JSON.stringify(match)}`);
    }
  }

  /** Publish an event envelope to the exchange. */
  async publish(routingKey: string, payload: unknown): Promise<void> {
    const envelope = {
      eventId: randomUUID(),
      eventType: routingKey,
      timestamp: new Date().toISOString(),
      payload,
      version: 1,
    };
    this.channel.publish(
      EXCHANGE,
      routingKey,
      Buffer.from(JSON.stringify(envelope)),
      { persistent: true },
    );
  }

  clear(): void {
    this.captured = [];
  }
}
