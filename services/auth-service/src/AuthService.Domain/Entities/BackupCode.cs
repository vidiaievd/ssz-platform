using AuthService.Domain.Common;

namespace AuthService.Domain.Entities;

public sealed class BackupCode : Entity
{
    private BackupCode() { }

    public Guid UserId { get; private set; }

    public string CodeHash { get; private set; } = default!;
    public bool IsUsed { get; private set; }
    public DateTimeOffset? UsedAt { get; private set; }

    public static BackupCode Create(Guid userId, string codeHash) => new()
    {
        UserId = userId,
        CodeHash = codeHash,
    };

    public void MarkAsUsed()
    {
        IsUsed = true;
        UsedAt = DateTimeOffset.UtcNow;
    }
}