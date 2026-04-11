using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace AuthService.Infrastructure.Persistence.Repositories;

public sealed class UserRepository(AuthDbContext db) : IUserRepository
{
    public async Task<User?> FindByEmailAsync(string email, CancellationToken ct = default) =>
        await db.Users
            .Include(u => u.Roles).ThenInclude(ur => ur.Role)
            .FirstOrDefaultAsync(u => u.NormalizedEmail == email.ToUpperInvariant(), ct);

    public async Task<User?> FindByIdAsync(Guid id, CancellationToken ct = default) =>
        await db.Users.FindAsync([id], ct);

    public async Task<User?> FindByIdWithTokensAsync(Guid id, CancellationToken ct = default) =>
        await db.Users
            .Include(u => u.RefreshTokens)
            .Include(u => u.Roles).ThenInclude(ur => ur.Role)
            .FirstOrDefaultAsync(u => u.Id == id, ct);

    public async Task<User?> FindByIdWithBackupCodesAsync(Guid id, CancellationToken ct = default) =>
        await db.Users
            .Include(u => u.BackupCodes)
            .Include(u => u.RefreshTokens)
            .Include(u => u.Roles).ThenInclude(ur => ur.Role)
            .FirstOrDefaultAsync(u => u.Id == id, ct);

    public async Task<User?> FindByIdWithRolesAsync(Guid id, CancellationToken ct = default) =>
        await db.Users
            .Include(u => u.Roles).ThenInclude(ur => ur.Role)
            .FirstOrDefaultAsync(u => u.Id == id, ct);

    public async Task<bool> ExistsByEmailAsync(string email, CancellationToken ct = default) =>
        await db.Users
            .AnyAsync(u => u.NormalizedEmail == email.ToUpperInvariant(), ct);

    public void Add(User user) => db.Users.Add(user);
    public void AddRefreshToken(Domain.Entities.RefreshToken token) =>
        db.RefreshTokens.Add(token);
    public void AddBackupCode(Domain.Entities.BackupCode backupCode) =>
        db.BackupCodes.Add(backupCode);
    public void RemoveBackupCodesForUser(Guid userId) =>
        db.BackupCodes.RemoveRange(db.BackupCodes.Where(bc => bc.UserId == userId));
}