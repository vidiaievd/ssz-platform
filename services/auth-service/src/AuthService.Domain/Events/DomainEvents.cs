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
    public int Version => 1;
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