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
/// </summary>
public sealed record UserDeletedEvent(
    Guid UserId
) : IDomainEvent
{
    public Guid EventId { get; } = Guid.NewGuid();
    public DateTimeOffset OccurredAt { get; } = DateTimeOffset.UtcNow;
    public int Version => 1;
}
