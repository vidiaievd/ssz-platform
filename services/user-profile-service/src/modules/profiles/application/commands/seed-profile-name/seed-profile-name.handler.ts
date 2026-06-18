import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { randomUUID } from 'crypto';
import type { IProfileRepository } from '../../../domain/repositories/profile.repository.interface.js';
import { PROFILE_REPOSITORY } from '../../../domain/repositories/profile.repository.interface.js';
import type { IEventPublisher } from '../../../../../shared/application/ports/event-publisher.interface.js';
import { EVENT_PUBLISHER } from '../../../../../shared/application/ports/event-publisher.interface.js';
import { SeedProfileNameCommand } from './seed-profile-name.command.js';

@CommandHandler(SeedProfileNameCommand)
export class SeedProfileNameHandler implements ICommandHandler<SeedProfileNameCommand> {
  private readonly logger = new Logger(SeedProfileNameHandler.name);

  constructor(
    @Inject(PROFILE_REPOSITORY)
    private readonly profileRepository: IProfileRepository,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(command: SeedProfileNameCommand): Promise<void> {
    const profile = await this.profileRepository.findByUserId(command.userId);
    if (!profile) {
      this.logger.warn(`SeedProfileName: profile not found for userId ${command.userId} — skipping`);
      return;
    }

    const needsFirstName = command.firstName && !profile.firstName;
    const needsLastName = command.lastName && !profile.lastName;

    if (!needsFirstName && !needsLastName) return;

    profile.updateBasicInfo(
      {
        firstName: needsFirstName ? command.firstName! : undefined,
        lastName: needsLastName ? command.lastName! : undefined,
      },
      randomUUID(),
    );

    await this.profileRepository.save(profile);

    for (const event of profile.getDomainEvents()) {
      await this.eventPublisher.publish(event);
    }
    profile.clearDomainEvents();

    this.logger.log(`Profile name seeded for userId ${command.userId}`);
  }
}
