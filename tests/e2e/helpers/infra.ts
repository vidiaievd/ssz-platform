import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RabbitMQContainer, type StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';

export interface InfraPorts {
  postgresUrl: string;
  redisHost: string;
  redisPort: number;
  redisPassword: string;
  rabbitmqUrl: string;
}

export class InfraContainers {
  private pg!: StartedPostgreSqlContainer;
  private rmq!: StartedRabbitMQContainer;
  private redis!: StartedRedisContainer;

  async start(): Promise<InfraPorts> {
    const REDIS_PASS = 'testpass';

    [this.pg, this.rmq, this.redis] = await Promise.all([
      new PostgreSqlContainer('postgres:16-alpine')
        .withUsername('ssz_test')
        .withPassword('ssz_test')
        .withDatabase('ssz_test')
        .start(),
      new RabbitMQContainer('rabbitmq:3-management-alpine').start(),
      new RedisContainer('redis:7-alpine')
        .withPassword(REDIS_PASS)
        .start(),
    ]);

    return {
      postgresUrl: this.pg.getConnectionUri(),
      redisHost: this.redis.getHost(),
      redisPort: this.redis.getMappedPort(6379),
      redisPassword: REDIS_PASS,
      rabbitmqUrl: this.rmq.getAmqpUrl(),
    };
  }

  async stop(): Promise<void> {
    await Promise.all([
      this.pg?.stop(),
      this.rmq?.stop(),
      this.redis?.stop(),
    ]);
  }
}
