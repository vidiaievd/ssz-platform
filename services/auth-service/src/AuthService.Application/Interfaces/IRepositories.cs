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

/// <summary>
/// Reads accounts for the admin panel (plan 90, phase 6). No password hash, TOTP secret, backup
/// code or refresh-token hash ever leaves this port.
/// </summary>
public interface IAdminUserReader
{
    /// <summary>One page of the accounts matching the criteria, and how many match in all.</summary>
    Task<AdminUserPage> ListAsync(
        AdminUserCriteria criteria,
        DateTimeOffset now,
        CancellationToken ct = default);

    /// <summary>The account, with the sessions it holds now; null when there is none.</summary>
    Task<AdminUserRecord?> GetAsync(Guid userId, DateTimeOffset now, CancellationToken ct = default);
}

/// <summary>A parsed and validated filter of the admin user list.</summary>
/// <param name="Search">Upper-cased substring of the e-mail; null = any.</param>
/// <param name="RoleId">Only accounts holding this role; null = any.</param>
/// <param name="Status">One of <see cref="AdminUserStatuses"/>; null = any.</param>
/// <param name="Ids">Only these accounts; null = any.</param>
/// <param name="Sort">One of <see cref="AdminUserSorts"/>.</param>
public sealed record AdminUserCriteria(
    string? Search,
    Guid? RoleId,
    string? Status,
    IReadOnlyList<Guid>? Ids,
    string Sort,
    int Page,
    int Limit);

/// <summary>What the list shows of one account.</summary>
public sealed record AdminUserRow(
    Guid Id,
    string Email,
    IReadOnlyList<string> Roles,
    string? AdminLevel,
    bool EmailVerified,
    bool TwoFactorEnabled,
    DateTimeOffset? BlockedAt,
    bool IsLocked,
    DateTimeOffset? LockedUntil,
    DateTimeOffset? DeletionRequestedAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset? LastLoginAt);

public sealed record AdminUserPage(IReadOnlyList<AdminUserRow> Items, int Total);

/// <summary>The card of one account.</summary>
/// <param name="ActiveTokens">Refresh tokens neither revoked nor expired — one per open session, newest first.</param>
/// <param name="LastIssuedByClient">When each client last got a refresh token, revoked or not.</param>
public sealed record AdminUserRecord(
    AdminUserRow Row,
    Guid? BlockedBy,
    string? BlockReason,
    int FailedLoginAttempts,
    DateTimeOffset? LastFailedLoginAt,
    int BackupCodesLeft,
    IReadOnlyList<AdminSessionToken> ActiveTokens,
    IReadOnlyDictionary<string, DateTimeOffset> LastIssuedByClient);

public sealed record AdminSessionToken(
    string ClientType,
    DateTimeOffset IssuedAt,
    DateTimeOffset ExpiresAt,
    string? DeviceInfo);

/// <summary>The admin trail (plan 90), written in the transaction of the change it records.</summary>
public interface IAdminAuditRepository
{
    void Add(AdminAuditEntry entry);
}

public interface IUnitOfWork
{
    Task<int> SaveChangesAsync(CancellationToken ct = default);
}