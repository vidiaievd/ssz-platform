using AuthService.Domain.Entities;

namespace AuthService.Application.Interfaces;

public interface IUserRepository
{
    Task<User?> FindByEmailAsync(string email, CancellationToken ct = default);
    Task<User?> FindByIdAsync(Guid id, CancellationToken ct = default);

    Task<User?> FindByIdWithTokensAsync(Guid id, CancellationToken ct = default);

    Task<User?> FindByIdWithBackupCodesAsync(Guid id, CancellationToken ct = default);

    Task<bool> ExistsByEmailAsync(string email, CancellationToken ct = default);

    void Add(User user);
    
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

public interface IUnitOfWork
{
    Task<int> SaveChangesAsync(CancellationToken ct = default);
}