import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { UpdateWorkloadPolicyCommand } from './update-workload-policy.command.js';

@CommandHandler(UpdateWorkloadPolicyCommand)
export class UpdateWorkloadPolicyHandler implements ICommandHandler<UpdateWorkloadPolicyCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(cmd: UpdateWorkloadPolicyCommand): Promise<void> {
    await this.prisma.workloadPolicy.upsert({
      where: { schoolId: cmd.schoolId },
      create: {
        schoolId: cmd.schoolId,
        prepFactor: cmd.prepFactor ?? 0.3,
        dailyContactCap: cmd.dailyContactCap ?? 6.0,
        maxConsecutive: cmd.maxConsecutive ?? 3,
        nearCapRatio: cmd.nearCapRatio ?? 0.85,
      },
      update: {
        ...(cmd.prepFactor !== undefined && { prepFactor: cmd.prepFactor }),
        ...(cmd.dailyContactCap !== undefined && { dailyContactCap: cmd.dailyContactCap }),
        ...(cmd.maxConsecutive !== undefined && { maxConsecutive: cmd.maxConsecutive }),
        ...(cmd.nearCapRatio !== undefined && { nearCapRatio: cmd.nearCapRatio }),
      },
    });
  }
}
