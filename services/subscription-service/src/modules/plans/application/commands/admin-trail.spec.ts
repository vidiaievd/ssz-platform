import { Result } from '../../../../shared/kernel/result.js';
import type { AdminAuditEntry } from '../../../../shared/application/admin-audit.js';
import { Plan } from '../../domain/plan.js';
import type { IPlanRepository } from '../ports/plan.repository.js';
import { ArchivePlanCommand } from './archive-plan/archive-plan.command.js';
import { ArchivePlanHandler } from './archive-plan/archive-plan.handler.js';
import { CreatePlanCommand } from './create-plan/create-plan.command.js';
import { CreatePlanHandler } from './create-plan/create-plan.handler.js';
import { RenamePlanCommand } from './rename-plan/rename-plan.command.js';
import { RenamePlanHandler } from './rename-plan/rename-plan.handler.js';
import { RevisePlanCommand } from './revise-plan/revise-plan.command.js';
import { RevisePlanHandler } from './revise-plan/revise-plan.handler.js';

const actor = { userId: 'super-1', level: 'super' as const };
const now = new Date('2026-10-01T00:00:00.000Z');
const credits = (n: string) => [{ featureKey: 'ai.review_draft', enabled: true, monthlyCredits: n, limits: {} }];

function tutorPro(): Plan {
  return Plan.create({ id: 'p1', code: 'tutor_pro', name: 'Tutor Pro', audience: 'workspace', features: credits('300'), createdBy: 'seed', now }).value;
}

function repo(plan: Plan | null = tutorPro()) {
  const plans = {
    findByCode: jest.fn().mockResolvedValue(plan),
    create: jest.fn().mockResolvedValue(Result.ok()),
    save: jest.fn().mockResolvedValue(Result.ok()),
  };
  return { plans, as: plans as unknown as IPlanRepository };
}

const audit = (mock: jest.Mock, i: number) => mock.mock.calls[0]![i] as AdminAuditEntry;

describe('admin trail of plan changes', () => {
  it('create: the whole first version is after, under the plan code', async () => {
    const r = repo();
    await new CreatePlanHandler(r.as).execute(new CreatePlanCommand('tutor_max', 'Tutor Max', 'workspace', credits('500'), actor, 'new tier'));
    expect(audit(r.plans.create, 1)).toMatchObject({
      actor,
      action: 'plan.created',
      targetType: 'plan',
      targetId: 'tutor_max',
      reason: 'new tier',
      before: null,
      after: { name: 'Tutor Max', audience: 'workspace', version: 1, features: [{ featureKey: 'ai.review_draft', monthlyCredits: '500' }] },
    });
  });

  it('revise: both versions with their features', async () => {
    const r = repo();
    await new RevisePlanHandler(r.as).execute(new RevisePlanCommand('tutor_pro', credits('400'), 1, actor, 'more credits'));
    expect(r.plans.save.mock.calls[0]![1]).toBe(1);
    expect(audit(r.plans.save, 2)).toMatchObject({
      action: 'plan.revised',
      before: { version: 1, features: [{ monthlyCredits: '300' }] },
      after: { version: 2, features: [{ monthlyCredits: '400' }] },
    });
  });

  it('rename: old and new name; the same name changes nothing and logs nothing', async () => {
    const r = repo();
    await new RenamePlanHandler(r.as).execute(new RenamePlanCommand('tutor_pro', 'Tutor Pro 2027', actor, 'rebrand'));
    expect(audit(r.plans.save, 2)).toMatchObject({ action: 'plan.renamed', before: { name: 'Tutor Pro' }, after: { name: 'Tutor Pro 2027' } });

    const same = repo();
    await new RenamePlanHandler(same.as).execute(new RenamePlanCommand('tutor_pro', 'Tutor Pro', actor, 'no-op'));
    expect(same.plans.save).not.toHaveBeenCalled();
  });

  it('archive: status before and after; a refused archive writes nothing', async () => {
    const r = repo();
    await new ArchivePlanHandler(r.as).execute(new ArchivePlanCommand('tutor_pro', actor, 'retired'));
    expect(audit(r.plans.save, 2)).toMatchObject({ action: 'plan.archived', before: { status: 'active' }, after: { status: 'archived' } });

    const archived = tutorPro();
    archived.archive();
    const again = repo(archived);
    await expect(new ArchivePlanHandler(again.as).execute(new ArchivePlanCommand('tutor_pro', actor, 'again'))).rejects.toThrow();
    expect(again.plans.save).not.toHaveBeenCalled();
  });
});
