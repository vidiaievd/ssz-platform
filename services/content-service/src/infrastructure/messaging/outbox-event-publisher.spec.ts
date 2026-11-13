jest.mock('../database/prisma.service.js', () => ({ PrismaService: class {} }));
jest.mock('@ssz/contracts', () => ({ EXCHANGES: { CONTENT: 'content.events' } }), {
  virtual: true,
});

import { ContainerDeletedEvent } from '../../modules/container/domain/events/container-deleted.event.js';
import { OutboxEventPublisher, toEnvelopeData } from './outbox-event-publisher.js';

describe('toEnvelopeData', () => {
  it('unwraps a domain event to its data', () => {
    const event = new ContainerDeletedEvent({ containerId: 'c1', ownerUserId: 'u1' });
    expect(toEnvelopeData(event)).toEqual({ containerId: 'c1', ownerUserId: 'u1' });
  });

  it('leaves plain data alone, even data with a payload field', () => {
    expect(toEnvelopeData({ containerId: 'c1' })).toEqual({ containerId: 'c1' });
    expect(toEnvelopeData({ payload: { a: 1 } })).toEqual({ payload: { a: 1 } });
  });
});

describe('OutboxEventPublisher', () => {
  it('writes the data, not the domain event, as the envelope payload', async () => {
    const rows: Array<{ payload: string; routingKey: string }> = [];
    const store = {
      insertPending: jest.fn((row: { payload: string; routingKey: string }) =>
        Promise.resolve(void rows.push(row)),
      ),
    };
    const event = new ContainerDeletedEvent({ containerId: 'c1', ownerUserId: 'u1' });

    await new OutboxEventPublisher(store as never).publish(event.eventType, event);

    const envelope = JSON.parse(rows[0].payload) as { eventType: string; payload: unknown };
    expect(rows[0].routingKey).toBe('content.container.deleted');
    expect(envelope.eventType).toBe('content.container.deleted');
    expect(envelope.payload).toEqual({ containerId: 'c1', ownerUserId: 'u1' });
  });
});
