using AuthService.Domain.Exceptions;

namespace AuthService.Domain.Entities;

/// <summary>
/// The admin level a platform administrator holds (plan 90). One row per user; no row means
/// the user may not open an admin-panel session, whatever their roles.
/// </summary>
public sealed class AdminLevelAssignment
{
    private AdminLevelAssignment() { }

    public Guid UserId { get; private set; }
    public string Level { get; private set; } = default!;
    public DateTimeOffset GrantedAt { get; private set; }

    /// <summary>The super administrator who granted it; null when granted from the command line.</summary>
    public Guid? GrantedBy { get; private set; }

    public static AdminLevelAssignment Create(
        Guid userId,
        string level,
        DateTimeOffset at,
        Guid? grantedBy = null)
    {
        EnsureKnown(level);
        return new AdminLevelAssignment
        {
            UserId = userId,
            Level = level,
            GrantedAt = at,
            GrantedBy = grantedBy,
        };
    }

    public void ChangeTo(string level, DateTimeOffset at, Guid? grantedBy = null)
    {
        EnsureKnown(level);
        Level = level;
        GrantedAt = at;
        GrantedBy = grantedBy;
    }

    private static void EnsureKnown(string level)
    {
        if (!AdminLevels.IsKnown(level))
            throw new DomainException($"Unknown admin level '{level}'.", "ADMIN_LEVEL_UNKNOWN");
    }
}
