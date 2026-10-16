using AuthService.Domain.Exceptions;

namespace AuthService.Domain.Entities;

/// <summary>
/// How long a refresh token lives for one role on one kind of client (ADR-012).
///
/// Sliding: every refresh issues a token with this lifetime again, so the number is how
/// long a session may go unused, not how long it may last. A user holding several roles
/// gets the shortest of them — a privileged account is bounded by its most dangerous role.
/// </summary>
public sealed class TokenLifetimePolicy
{
    /// <summary>One hour: below this a session is a nuisance rather than a protection.</summary>
    public const int MinHours = 1;

    /// <summary>Ninety days: past this a stolen token is as good as a password.</summary>
    public const int MaxHours = 90 * 24;

    private TokenLifetimePolicy() { }

    public string Role { get; private set; } = default!;
    public string ClientType { get; private set; } = default!;
    public int RefreshLifetimeHours { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    /// <summary>The platform administrator who last changed it; null for the seeded default.</summary>
    public Guid? UpdatedBy { get; private set; }

    public TimeSpan RefreshLifetime => TimeSpan.FromHours(RefreshLifetimeHours);

    public static TokenLifetimePolicy Create(
        string role,
        string clientType,
        int refreshLifetimeHours,
        DateTimeOffset updatedAt,
        Guid? updatedBy = null)
    {
        EnsureClient(clientType);
        EnsureBounds(refreshLifetimeHours);
        return new TokenLifetimePolicy
        {
            Role = role,
            ClientType = clientType,
            RefreshLifetimeHours = refreshLifetimeHours,
            UpdatedAt = updatedAt,
            UpdatedBy = updatedBy,
        };
    }

    /// <summary>
    /// A new lifetime, effective for tokens issued or rotated from now on. Tokens already
    /// issued keep the expiry they were given.
    /// </summary>
    public void Change(int refreshLifetimeHours, Guid changedBy, DateTimeOffset at)
    {
        EnsureBounds(refreshLifetimeHours);
        RefreshLifetimeHours = refreshLifetimeHours;
        UpdatedBy = changedBy;
        UpdatedAt = at;
    }

    private static void EnsureClient(string clientType)
    {
        if (!ClientTypes.All.Contains(clientType))
            throw new DomainException(
                $"Unknown client type '{clientType}'.", "TOKEN_LIFETIME_UNKNOWN_CLIENT");
    }

    private static void EnsureBounds(int hours)
    {
        if (hours < MinHours || hours > MaxHours)
            throw new DomainException(
                $"A refresh token lifetime must be between {MinHours} and {MaxHours} hours.",
                "TOKEN_LIFETIME_OUT_OF_BOUNDS");
    }
}

/// <summary>
/// The lifetimes the platform starts with (ADR-012), in hours. Administrators get the
/// shortest sessions; a student on a phone gets a month, so that weeks of offline practice
/// end with a sync rather than a password prompt.
/// </summary>
public static class DefaultTokenLifetimes
{
    private const int Day = 24;

    public static readonly IReadOnlyList<(string Role, string ClientType, int Hours)> All =
    [
        (RoleNames.PlatformAdmin,   ClientTypes.Web,    12),
        (RoleNames.PlatformAdmin,   ClientTypes.Mobile, 12),
        (RoleNames.ManagerPlatform, ClientTypes.Web,    1 * Day),
        (RoleNames.ManagerPlatform, ClientTypes.Mobile, 1 * Day),
        (RoleNames.SchoolAdmin,     ClientTypes.Web,    3 * Day),
        (RoleNames.SchoolAdmin,     ClientTypes.Mobile, 7 * Day),
        (RoleNames.Teacher,         ClientTypes.Web,    7 * Day),
        (RoleNames.Teacher,         ClientTypes.Mobile, 14 * Day),
        (RoleNames.Tutor,           ClientTypes.Web,    7 * Day),
        (RoleNames.Tutor,           ClientTypes.Mobile, 14 * Day),
        (RoleNames.Student,         ClientTypes.Web,    7 * Day),
        (RoleNames.Student,         ClientTypes.Mobile, 30 * Day),
        (RoleNames.Premium,         ClientTypes.Web,    7 * Day),
        (RoleNames.Premium,         ClientTypes.Mobile, 30 * Day),
    ];
}
