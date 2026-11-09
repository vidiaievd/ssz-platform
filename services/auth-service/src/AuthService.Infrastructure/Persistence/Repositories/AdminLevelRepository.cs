using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace AuthService.Infrastructure.Persistence.Repositories;

public sealed class AdminLevelRepository(AuthDbContext db) : IAdminLevelRepository
{
    public async Task<AdminLevelAssignment?> FindAsync(Guid userId, CancellationToken ct = default) =>
        await db.AdminLevels.FirstOrDefaultAsync(a => a.UserId == userId, ct);

    public void Add(AdminLevelAssignment assignment) => db.AdminLevels.Add(assignment);

    public void Remove(AdminLevelAssignment assignment) => db.AdminLevels.Remove(assignment);

    public async Task<int> CountAtLevelAsync(string level, CancellationToken ct = default) =>
        await db.AdminLevels.CountAsync(a => a.Level == level, ct);

    public async Task<List<AdminListItem>> ListAsync(CancellationToken ct = default)
    {
        var rows = await db.AdminLevels
            .Join(db.Users, a => a.UserId, u => u.Id, (a, u) => new AdminListItem(
                u.Id, u.Email, a.Level, a.GrantedAt, a.GrantedBy, u.TwoFactorEnabled))
            .AsNoTracking()
            .ToListAsync(ct);

        // Ordered here: the rank of a level is domain knowledge, not a column.
        return rows
            .OrderByDescending(r => AdminLevels.All.ToList().IndexOf(r.Level))
            .ThenBy(r => r.Email, StringComparer.Ordinal)
            .ToList();
    }
}

public sealed class AdminAuditRepository(AuthDbContext db) : IAdminAuditRepository
{
    public void Add(AdminAuditEntry entry) => db.AdminAudit.Add(entry);
}
