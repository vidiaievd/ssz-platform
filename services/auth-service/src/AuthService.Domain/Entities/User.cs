using AuthService.Domain.Common;
using AuthService.Domain.Events;
using AuthService.Domain.Exceptions;

namespace AuthService.Domain.Entities;

public sealed class User : AggregateRoot
{
    private readonly List<UserRole> _roles = [];
    private readonly List<RefreshToken> _refreshTokens = [];
    private readonly List<BackupCode> _backupCodes = [];

    private User() { }

    public string Email { get; private set; } = default!;
    public string NormalizedEmail { get; private set; } = default!;
    public string PasswordHash { get; private set; } = default!;
    public bool EmailVerified { get; private set; }
    public bool IsLocked { get; private set; }
    public DateTimeOffset? LockedUntil { get; private set; }
    public int FailedLoginAttempts { get; private set; }
    public DateTimeOffset? LastFailedLoginAt { get; private set; }
    public bool TwoFactorEnabled { get; private set; }
    public string? TotpSecretEncrypted { get; private set; }
    public bool TotpVerified { get; private set; }
    public DateTimeOffset? LastLoginAt { get; private set; }

    public IReadOnlyList<UserRole> Roles => _roles.AsReadOnly();
    public IReadOnlyList<RefreshToken> RefreshTokens => _refreshTokens.AsReadOnly();
    public IReadOnlyList<BackupCode> BackupCodes => _backupCodes.AsReadOnly();

    public static User Create(string email, string passwordHash, string role = "student")
    {
        var user = new User
        {
            Email = email.Trim().ToLowerInvariant(),
            NormalizedEmail = email.Trim().ToUpperInvariant(),
            PasswordHash = passwordHash,
        };

        user.AddDomainEvent(new UserRegisteredEvent(user.Id, user.Email, role));
        return user;
    }

    public void RecordSuccessfulLogin()
    {
        FailedLoginAttempts = 0;
        LastFailedLoginAt = null;
        IsLocked = false;
        LockedUntil = null;
        LastLoginAt = DateTimeOffset.UtcNow;
        SetUpdated();
        AddDomainEvent(new UserLoggedInEvent(Id, Email, TwoFactorEnabled));
    }

    public void RecordFailedLogin(int maxAttempts, TimeSpan lockoutDuration)
    {
        FailedLoginAttempts++;
        LastFailedLoginAt = DateTimeOffset.UtcNow;

        if (FailedLoginAttempts >= maxAttempts)
        {
            IsLocked = true;
            LockedUntil = DateTimeOffset.UtcNow.Add(lockoutDuration);
        }

        SetUpdated();
    }

    public bool IsCurrentlyLocked() =>
        IsLocked && (LockedUntil == null || LockedUntil > DateTimeOffset.UtcNow);

    public void UnlockIfExpired()
    {
        if (IsLocked && LockedUntil.HasValue && LockedUntil <= DateTimeOffset.UtcNow)
        {
            IsLocked = false;
            LockedUntil = null;
            FailedLoginAttempts = 0;
            SetUpdated();
        }
    }

    public void SetTotpSecret(string encryptedSecret)
    {
        TotpSecretEncrypted = encryptedSecret;
        TotpVerified = false;
        SetUpdated();
    }

    public void ConfirmTotpVerification()
    {
        TotpVerified = true;
        SetUpdated();
    }

    public void EnableTwoFactor(IEnumerable<BackupCode> backupCodes)
    {
        if (TotpSecretEncrypted is null || !TotpVerified)
            throw new DomainException(
                "TOTP must be set and verified before enabling 2FA.",
                "TOTP_NOT_VERIFIED");

        TwoFactorEnabled = true;
        _backupCodes.Clear();
        _backupCodes.AddRange(backupCodes);
        SetUpdated();
        AddDomainEvent(new User2FAEnabledEvent(Id, Email));
    }

    public void DisableTwoFactor()
    {
        TwoFactorEnabled = false;
        TotpSecretEncrypted = null;
        TotpVerified = false;
        _backupCodes.Clear();
        SetUpdated();
        AddDomainEvent(new User2FADisabledEvent(Id, Email));
    }

    public void ConsumeBackupCode(Guid backupCodeId)
    {
        var code = _backupCodes
            .SingleOrDefault(c => c.Id == backupCodeId && !c.IsUsed)
            ?? throw new DomainException(
                "Backup code is invalid or already used.",
                "INVALID_BACKUP_CODE");

        code.MarkAsUsed();
        SetUpdated();
    }

    public RefreshToken AddRefreshToken(
        string tokenHash,
        string familyId,
        DateTimeOffset expiresAt,
        string? deviceInfo = null)
    {
        var token = RefreshToken.Create(Id, tokenHash, familyId, expiresAt, deviceInfo);
        _refreshTokens.Add(token);
        return token;
    }

    public void RevokeRefreshTokenFamily(string familyId)
    {
        foreach (var token in _refreshTokens.Where(t => t.FamilyId == familyId))
            token.Revoke();

        SetUpdated();
    }

    public void RevokeAllRefreshTokens()
    {
        foreach (var token in _refreshTokens.Where(t => !t.IsRevoked))
            token.Revoke();

        SetUpdated();
        AddDomainEvent(new UserLoggedOutEvent(Id, Email));
    }

    public void AssignRole(Role role)
    {
        if (_roles.Any(r => r.RoleId == role.Id)) return;
        _roles.Add(UserRole.Create(Id, role.Id));
        SetUpdated();
    }

    public void VerifyEmail()
    {
        EmailVerified = true;
        SetUpdated();
    }

    public void ChangePassword(string newPasswordHash)
    {
        PasswordHash = newPasswordHash;
        RevokeAllRefreshTokens();
        SetUpdated();
    }
}