import { Module } from '@nestjs/common';
import { UserRegisteredConsumer } from './consumers/user-registered.consumer';
import { ProfilesModule } from '../profiles/profiles.module';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Module({
  imports: [ProfilesModule],
  providers: [UserRegisteredConsumer, PrismaService],
})
export class EventsModule {}
