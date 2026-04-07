import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Inject } from '@nestjs/common';
import * as amqplib from 'amqplib';

interface RabbitMQConfig {
  url: string;
  exchangeProfiles: string;
}

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: amqplib.Connection | null = null;
  private channel: amqplib.Channel | null = null;

  constructor(@Inject('RABBITMQ_CONFIG') private readonly config: RabbitMQConfig) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  private async connect(): Promise<void> {
    try {
      this.connection = await amqplib.connect(this.config.url);
      this.channel = await this.connection.createChannel();

      // Declare the outgoing exchange as durable topic exchange
      await this.channel.assertExchange(this.config.exchangeProfiles, 'topic', {
        durable: true,
      });

      this.logger.log('RabbitMQ connection established');

      // Reconnect on unexpected connection close
      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed — reconnecting in 5s');
        setTimeout(() => this.connect(), 5000);
      });

      this.connection.on('error', (err) => {
        this.logger.error('RabbitMQ connection error', err);
      });
    } catch (error) {
      this.logger.error('Failed to connect to RabbitMQ — retrying in 5s', error);
      setTimeout(() => this.connect(), 5000);
    }
  }

  private async disconnect(): Promise<void> {
    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch (error) {
      this.logger.error('Error during RabbitMQ disconnect', error);
    }
  }

  /**
   * Publish a message to the profiles exchange with the given routing key.
   * Messages are persistent (deliveryMode 2) so they survive broker restarts.
   */
  async publish(routingKey: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.channel) {
      this.logger.error('Cannot publish — channel is not available');
      return;
    }

    const content = Buffer.from(JSON.stringify(payload));

    this.channel.publish(this.config.exchangeProfiles, routingKey, content, {
      persistent: true,
      contentType: 'application/json',
      timestamp: Math.floor(Date.now() / 1000),
    });

    this.logger.debug(`Published event [${routingKey}]`);
  }

  /**
   * Consume messages from a queue.
   * The caller provides a handler function that receives the parsed payload.
   * The consumer acks the message after the handler resolves successfully.
   */
  async consume(
    queue: string,
    exchange: string,
    routingKeys: string[],
    handler: (payload: Record<string, unknown>, eventId: string) => Promise<void>,
  ): Promise<void> {
    if (!this.channel) {
      this.logger.error('Cannot consume — channel is not available');
      return;
    }

    // Assert the source exchange (users_exchange) as durable topic exchange
    await this.channel.assertExchange(exchange, 'topic', { durable: true });

    // Declare the service queue as durable so messages survive restarts
    await this.channel.assertQueue(queue, { durable: true });

    // Bind the queue to each routing key
    for (const key of routingKeys) {
      await this.channel.bindQueue(queue, exchange, key);
    }

    // Process one message at a time to avoid overloading the service
    this.channel.prefetch(1);

    await this.channel.consume(queue, async (msg) => {
      if (!msg) return;

      const eventId = msg.properties.messageId || msg.properties.correlationId || '';

      try {
        const payload = JSON.parse(msg.content.toString()) as Record<string, unknown>;
        await handler(payload, eventId);
        this.channel!.ack(msg);
      } catch (error) {
        this.logger.error(`Failed to process message [${msg.fields.routingKey}]`, error);
        // Reject and requeue on processing failure
        this.channel!.nack(msg, false, true);
      }
    });

    this.logger.log(`Consuming queue [${queue}] with keys: ${routingKeys.join(', ')}`);
  }
}
