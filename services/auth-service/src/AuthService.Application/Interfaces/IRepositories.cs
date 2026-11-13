using AuthService.Domain.Entities;

namespace AuthService.Application.Interfaces;

public interface IUserRepository
{
    Task<User?> FindByEmailAsync(string email, CancellationToken ct = default);
    Task<User?> FindByIdAsync(Guid id, CancellationToken ct = default);

    Task<User?> FindByIdWithTokensAsync(Guid id, CancellationToken ct = default);

    Task<User?> FindByIdWithBackupCodesAsync(Guid id, CancellationToken ct = default);

    Task<User?> FindByIdWithRolesAsync(Guid id, CancellationToken ct = default);

    Task<bool> ExistsByEmailAsync(string email, CancellationToken ct = default);

    /// <summary>Users who asked to be deleted before this instant, oldest request first.</summary>
    Task<List<Guid>> ListDueForPurgeAsync(
        DateTimeOffset requestedBefore,
        int limit,
        CancellationToken ct = default);

    void Add(User user);
    void Remove(User user);

    void AddRefreshToken(Domain.Entities.RefreshToken token);
    void AddBackupCode(Domain.Entities.BackupCode backupCode);
    void RemoveBackupCodesForUser(Guid userId);
}

public interface IRoleRepository
{
    Task<Role?> FindByNameAsync(string name, CancellationToken ct = default);
    Task<List<string>> GetRoleNamesForUserAsync(Guid userId, CancellationToken ct = default);
}

public interface IRefreshTokenRepository
{
    Task<RefreshToken?> FindActiveByHashAsync(
        string tokenHash,
        CancellationToken ct = default);
}

/// <summary>Refresh-token lifetimes per role and client (ADR-012).</summary>
public interface ITokenLifetimePolicyRepository
{
    Task<List<TokenLifetimePolicy>> ListAsync(CancellationToken ct = default);

    /// <summary>The policies of these roles on this client — tracked, so a change is saved.</summary>
    Task<List<TokenLifetimePolicy>> ListForAsync(
        IReadOnlyCollection<string> roles,
        string clientType,
        CancellationToken ct = default);

    void Add(TokenLifetimePolicy policy);
}

/// <summary>Admin levels of platform administrators (plan 90).</summary>
public interface IAdminLevelRepository
{
    /// <summary>Tracked, so a change is saved.</summary>
    Task<AdminLevelAssignment?> FindAsync(Guid userId, CancellationToken ct = default);

    void Add(AdminLevelAssignment assignment);
    void Remove(AdminLevelAssignment assignment);

    /// <summary>How many administrators hold exactly this level.</summary>
    Task<int> CountAtLevelAsync(string level, CancellationToken ct = default);

    /// <summary>Every administrator with their account, highest level first, then by email.</summary>
    Task<List<AdminListItem>> ListAsync(CancellationToken ct = default);
}

public sealed record AdminListItem(
    Guid UserId,
    string Email,
    string Level,
    DateTimeOffset GrantedAt,
    Guid? GrantedBy,
    bool TwoFactorEnabled);

/// <summary>The admin trail (plan 90), written in the transaction of the change it records.</summary>
public interface IAdminAuditRepository
{
    void Add(AdminAuditEntry entry);
}

public interface IUnitOfWork
{
    Task<int> SaveChangesAsync(CancellationToken ct = default);
}