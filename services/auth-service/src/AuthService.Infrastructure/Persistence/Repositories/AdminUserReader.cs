using AuthService.Application.Interfaces;
using AuthService.Application.Services;
using Microsoft.EntityFrameworkCore;

namespace AuthService.Infrastructure.Persistence.Repositories;

/// <summary>
/// Accounts for the admin panel (plan 90, phase 6). Reads only — no tracking — and projects
/// every query onto the fields the panel shows, so no hash or secret is ever loaded.
/// </summary>
public sealed class AdminUserReader(AuthDbContext db) : IAdminUserReader
{
    public async Task<AdminUserPage> ListAsync(
        AdminUserCriteria criteria,
        DateTimeOffset now,
        CancellationToken ct = default)
    {
        var filtered = AdminUserFilter.Apply(db.Users.AsNoTracking(), criteria, now);
        var total = await filtered.CountAsync(ct);
        if (total == 0) return new AdminUserPage([], 0);

        var rows = await AdminUserFilter.Sort(filtered, criteria.Sort)
            .Skip((criteria.Page - 1) * criteria.Limit)
            .Take(criteria.Limit)
            .Select(u => new
            {
                u.Id,
                u.Email,
                Roles = u.Roles.Select(r => r.Role.Name).ToList(),
                u.EmailVerified,
                u.TwoFactorEnabled,
                u.BlockedAt,
                u.IsLocked,
                u.LockedUntil,
                u.DeletionRequestedAt,
                u.CreatedAt,
                u.LastLoginAt,
            })
            .ToListAsync(ct);

        var ids = rows.Select(r => r.Id).ToList();
        var levels = await LevelsAsync(ids, ct);

        return new AdminUserPage(
            rows.Select(r => new AdminUserRow(
                r.Id,
                r.Email,
                SortRoles(r.Roles),
                levels.GetValueOrDefault(r.Id),
                r.EmailVerified,
                r.TwoFactorEnabled,
                r.BlockedAt,
                r.IsLocked,
                r.LockedUntil,
                r.DeletionRequestedAt,
                r.CreatedAt,
                r.LastLoginAt)).ToList(),
            total);
    }

    public async Task<AdminUserRecord?> GetAsync(
        Guid userId,
        DateTimeOffset now,
        CancellationToken ct = default)
    {
        var u = await db.Users
            .AsNoTracking()
            .Where(x => x.Id == userId)
            .Select(x => new
            {
                x.Id,
                x.Email,
                Roles = x.Roles.Select(r => r.Role.Name).ToList(),
                x.EmailVerified,
                x.TwoFactorEnabled,
                x.BlockedAt,
                x.BlockedBy,
                x.BlockReason,
                x.IsLocked,
                x.LockedUntil,
                x.FailedLoginAttempts,
                x.LastFailedLoginAt,
                x.DeletionRequestedAt,
                x.CreatedAt,
                x.LastLoginAt,
                BackupCodesLeft = x.BackupCodes.Count(c => !c.IsUsed),
            })
            .FirstOrDefaultAsync(ct);

        if (u is null) return null;

        var levels = await LevelsAsync([userId], ct);

        // One open session holds one live token: a refresh revokes the token it replaces.
        var active = await db.RefreshTokens
            .AsNoTracking()
            .Where(t => t.UserId == userId && !t.IsRevoked && t.ExpiresAt > now)
            .OrderByDescending(t => t.CreatedAt)
            .Select(t => new AdminSessionToken(t.ClientType, t.CreatedAt, t.ExpiresAt, t.DeviceInfo))
            .ToListAsync(ct);

        var lastIssued = await db.RefreshTokens
            .AsNoTracking()
            .Where(t => t.UserId == userId)
            .GroupBy(t => t.ClientType)
            .Select(g => new { Client = g.Key, Last = g.Max(t => t.CreatedAt) })
            .ToDictionaryAsync(g => g.Client, g => g.Last, ct);

        return new AdminUserRecord(
            new AdminUserRow(
                u.Id,
                u.Email,
                SortRoles(u.Roles),
                levels.GetValueOrDefault(u.Id),
                u.EmailVerified,
                u.TwoFactorEnabled,
                u.BlockedAt,
                u.IsLocked,
                u.LockedUntil,
                u.DeletionRequestedAt,
                u.CreatedAt,
                u.LastLoginAt),
            u.BlockedBy,
            u.BlockReason,
            u.FailedLoginAttempts,
            u.LastFailedLoginAt,
            u.BackupCodesLeft,
            active,
            lastIssued);
    }

    private async Task<Dictionary<Guid, string>> LevelsAsync(List<Guid> userIds, CancellationToken ct) =>
        await db.AdminLevels
            .AsNoTracking()
            .Where(a => userIds.Contains(a.UserId))
            .ToDictionaryAsync(a => a.UserId, a => a.Level, ct);

    private static IReadOnlyList<string> SortRoles(List<string> roles) =>
        roles.OrderBy(r => r, StringComparer.Ordinal).ToList();
}
