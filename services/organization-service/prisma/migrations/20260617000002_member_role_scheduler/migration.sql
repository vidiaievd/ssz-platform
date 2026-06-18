-- Pre-existing drift fix: MemberRole.SCHEDULER was added to the Prisma schema/code
-- previously but never applied to the database enum.
ALTER TYPE "MemberRole" ADD VALUE 'SCHEDULER';
