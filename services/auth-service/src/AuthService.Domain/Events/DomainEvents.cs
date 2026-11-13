using AuthService.Domain.Common;

namespace AuthService.Domain.Events;

public sealed record UserRegisteredEvent(
    Guid UserId,
    string Email,
    IReadOnlyList<string> Roles
) : IDomainEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
    public int Version => 2;
}

public sealed record UserLoggedInEvent(
    Guid UserId,
    string Email,
    bool MfaUsed
) : IDomainEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
    public int Version => 1;
}

public sealed record User2FAEnabledEvent(
    Guid UserId,
    string Email
) : IDomainEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
    public int Version => 1;
}

public sealed record User2FADisabledEvent(
    Guid UserId,
    string Email
) : IDomainEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
    public int Version => 1;
}

public sealed record UserLoggedOutEvent(
    Guid UserId,
    string Email
) : IDomainEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
    public int Version => 1;
}

public sealed record PasswordResetRequestedEvent(
    Guid UserId,
    string Email,
    string ResetUrl,
    int ExpiresInMinutes
) : IDomainEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
    public int Version => 1;
}

public sealed record PasswordChangedEvent(
    Guid UserId,
    string Email
) : IDomainEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
    public int Version => 1;
}

public sealed record EmailVerificationRequestedEvent(
    Guid UserId,
    string Email,
    string VerificationUrl,
    int ExpiresInMinutes
) : IDomainEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
    public int Version => 1;
}

public sealed record EmailVerifiedEvent(
    Guid UserId,
    string Email
) : IDomainEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
    public int Version => 1;
}

/// <summary>
/// The account is erased for good: every service drops what it holds about the user.
/// Published only after the grace period, never when the deletion is merely requested.
/// Carries the address because invitations elsewhere are keyed by it, and nobody can look
/// it up once auth has erased the row.
/// </summary>
public sealed record UserDeletedEvent(
    Guid UserId,
    string Email
) : IDomainEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
    public int Version => 1;
}

/// <summary>
/// An administrator changed something (plan 90). Published on <c>auth.events</c> with the routing
/// key <c>admin.action.performed</c>; every service that has admin routes publishes the same
/// payload, and analytics-service folds them into one journal.
/// </summary>
/// <param name="ActorId">Null when the change came from the command line.</param>
/// <param name="Action">Dotted, e.g. <c>admin.granted</c>.</param>
/// <param name="Before">Null when the object did not exist; camelCase keys.</param>
/// <param name="After">Null when the object no longer exists; camelCase keys.</param>
public sealed record AdminActionPerformedEvent(
    Guid? ActorId,
    string? ActorLevel,
    string Action,
    string TargetType,
    string TargetId,
    string? Reason,
    IReadOnlyDictionary<string, object?>? Before,
    IReadOnlyDictionary<string, object?>? After
) : IDomainEvent
{
    public const string ServiceName = "auth";

    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
    public int Version => 1;
}
