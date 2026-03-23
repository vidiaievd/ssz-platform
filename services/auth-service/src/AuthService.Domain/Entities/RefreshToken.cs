using AuthService.Domain.Common;

namespace AuthService.Domain.Entities;

public sealed class RefreshToken : Entity
{
    private RefreshToken() { }

    public Guid UserId { get; private set; }
    public string TokenHash { get; private set; } = default!;

    public string FamilyId { get; private set; } = default!;
    public bool IsRevoked { get; private set; }
    public DateTimeOffset ExpiresAt { get; private set; }
    public DateTimeOffset? RevokedAt { get; private set; }
    public string? DeviceInfo { get; private set; }

    public bool IsExpired => DateTimeOffset.UtcNow >= ExpiresAt;
    public bool IsActive => !IsRevoked && !IsExpired;

    public static RefreshToken Create(
        Guid userId,
        string tokenHash,
        string familyId,
        DateTimeOffset expiresAt,
        string? deviceInfo = null) => new()
    {
        UserId = userId,
        TokenHash = tokenHash,
        FamilyId = familyId,
        ExpiresAt = expiresAt,
        DeviceInfo = deviceInfo,
    };

    public void Revoke()
    {
        IsRevoked = true;
        RevokedAt = DateTimeOffset.UtcNow;
    }
}