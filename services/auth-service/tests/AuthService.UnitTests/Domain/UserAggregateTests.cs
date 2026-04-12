using AuthService.Domain.Entities;
using AuthService.Domain.Events;
using AuthService.Domain.Exceptions;
using FluentAssertions;
using Xunit;

namespace AuthService.UnitTests.Domain;

public sealed class UserAggregateTests
{
    // ── User.Create ───────────────────────────────────────────────────────────

    [Fact]
    public void Create_ShouldNormalizeEmail()
    {
        var user = User.Create("User@EXAMPLE.COM", "hash", ["student"]);

        user.Email.Should().Be("user@example.com");
        user.NormalizedEmail.Should().Be("USER@EXAMPLE.COM");
    }

    [Fact]
    public void Create_ShouldEmitUserRegisteredEvent()
    {
        var user = User.Create("test@example.com", "hash", ["student"]);

        user.DomainEvents.Should().ContainSingle()
            .Which.Should().BeOfType<UserRegisteredEvent>();
    }

    [Fact]
    public void Create_ShouldSetCorrectEmailInEvent()
    {
        var user = User.Create("test@example.com", "hash", ["student"]);

        var evt = user.DomainEvents.OfType<UserRegisteredEvent>().Single();
        evt.Email.Should().Be("test@example.com");
        evt.UserId.Should().Be(user.Id);
    }

    [Fact]
    public void Create_ShouldIncludeSingleRoleInEvent()
    {
        var user = User.Create("test@example.com", "hash", ["student"]);

        var evt = user.DomainEvents.OfType<UserRegisteredEvent>().Single();
        evt.Roles.Should().ContainSingle().Which.Should().Be("student");
    }

    [Fact]
    public void Create_ShouldIncludeMultipleRolesInEvent()
    {
        var user = User.Create("tutor@example.com", "hash", ["student", "tutor"]);

        var evt = user.DomainEvents.OfType<UserRegisteredEvent>().Single();
        evt.Roles.Should().BeEquivalentTo(["student", "tutor"]);
    }

    // ── Lockout ───────────────────────────────────────────────────────────────

    [Fact]
    public void RecordFailedLogin_BelowThreshold_ShouldNotLock()
    {
        var user = User.Create("test@example.com", "hash", ["student"]);

        user.RecordFailedLogin(maxAttempts: 5, lockoutDuration: TimeSpan.FromMinutes(15));

        user.IsCurrentlyLocked().Should().BeFalse();
        user.FailedLoginAttempts.Should().Be(1);
    }

    [Fact]
    public void RecordFailedLogin_AtThreshold_ShouldLockAccount()
    {
        var user = User.Create("test@example.com", "hash", ["student"]);

        for (var i = 0; i < 5; i++)
            user.RecordFailedLogin(maxAttempts: 5, lockoutDuration: TimeSpan.FromMinutes(15));

        user.IsCurrentlyLocked().Should().BeTrue();
        user.LockedUntil.Should().BeCloseTo(
            DateTimeOffset.UtcNow.AddMinutes(15),
            precision: TimeSpan.FromSeconds(5));
    }

    [Fact]
    public void RecordSuccessfulLogin_ShouldResetFailedAttempts()
    {
        var user = User.Create("test@example.com", "hash", ["student"]);
        user.RecordFailedLogin(maxAttempts: 5, lockoutDuration: TimeSpan.FromMinutes(15));

        user.RecordSuccessfulLogin();

        user.FailedLoginAttempts.Should().Be(0);
        user.IsCurrentlyLocked().Should().BeFalse();
        user.LastLoginAt.Should().NotBeNull();
    }

    [Fact]
    public void RecordSuccessfulLogin_ShouldEmitUserLoggedInEvent()
    {
        var user = User.Create("test@example.com", "hash", ["student"]);
        user.ClearDomainEvents();

        user.RecordSuccessfulLogin();

        user.DomainEvents.Should().ContainSingle()
            .Which.Should().BeOfType<UserLoggedInEvent>();
    }

    [Fact]
    public void UnlockIfExpired_WhenLockoutExpired_ShouldUnlock()
    {
        var user = User.Create("test@example.com", "hash", ["student"]);

        // Simulate lockout that already expired
        for (var i = 0; i < 5; i++)
            user.RecordFailedLogin(
                maxAttempts: 5,
                lockoutDuration: TimeSpan.FromMilliseconds(-1)); // already expired

        user.UnlockIfExpired();

        user.IsCurrentlyLocked().Should().BeFalse();
        user.FailedLoginAttempts.Should().Be(0);
    }

    // ── 2FA ───────────────────────────────────────────────────────────────────

    [Fact]
    public void EnableTwoFactor_WithoutVerifiedTotp_ShouldThrow()
    {
        var user = User.Create("test@example.com", "hash", ["student"]);
        user.SetTotpSecret("encrypted-secret");
        // ConfirmTotpVerification NOT called

        var act = () => user.EnableTwoFactor([]);

        act.Should().Throw<DomainException>()
            .WithMessage("*verified*");
    }

    [Fact]
    public void EnableTwoFactor_WithVerifiedTotp_ShouldEnable()
    {
        var user = User.Create("test@example.com", "hash", ["student"]);
        user.SetTotpSecret("encrypted-secret");
        user.ConfirmTotpVerification();
        var backupCodes = CreateBackupCodes(user.Id, 8);

        user.EnableTwoFactor(backupCodes);

        user.TwoFactorEnabled.Should().BeTrue();
        user.BackupCodes.Should().HaveCount(8);
    }

    [Fact]
    public void EnableTwoFactor_ShouldEmit2FAEnabledEvent()
    {
        var user = User.Create("test@example.com", "hash", ["student"]);
        user.SetTotpSecret("encrypted-secret");
        user.ConfirmTotpVerification();
        user.ClearDomainEvents();

        user.EnableTwoFactor(CreateBackupCodes(user.Id, 8));

        user.DomainEvents.Should().ContainSingle()
            .Which.Should().BeOfType<User2FAEnabledEvent>();
    }

    [Fact]
    public void DisableTwoFactor_ShouldClearTotpAndBackupCodes()
    {
        var user = CreateUserWith2FA();
        user.ClearDomainEvents();

        user.DisableTwoFactor();

        user.TwoFactorEnabled.Should().BeFalse();
        user.TotpSecretEncrypted.Should().BeNull();
        user.TotpVerified.Should().BeFalse();
        user.BackupCodes.Should().BeEmpty();
    }

    [Fact]
    public void DisableTwoFactor_ShouldEmit2FADisabledEvent()
    {
        var user = CreateUserWith2FA();
        user.ClearDomainEvents();

        user.DisableTwoFactor();

        user.DomainEvents.Should().ContainSingle()
            .Which.Should().BeOfType<User2FADisabledEvent>();
    }

    [Fact]
    public void SetTotpSecret_ShouldResetVerification()
    {
        var user = User.Create("test@example.com", "hash", ["student"]);
        user.SetTotpSecret("first-secret");
        user.ConfirmTotpVerification();

        // Setting new secret resets verification
        user.SetTotpSecret("second-secret");

        user.TotpVerified.Should().BeFalse();
    }

    // ── Backup codes ──────────────────────────────────────────────────────────

    [Fact]
    public void ConsumeBackupCode_ValidCode_ShouldMarkAsUsed()
    {
        var user = CreateUserWith2FA();
        var code = user.BackupCodes.First(c => !c.IsUsed);

        user.ConsumeBackupCode(code.Id);

        user.BackupCodes.First(c => c.Id == code.Id).IsUsed.Should().BeTrue();
    }

    [Fact]
    public void ConsumeBackupCode_AlreadyUsed_ShouldThrow()
    {
        var user = CreateUserWith2FA();
        var code = user.BackupCodes.First();
        user.ConsumeBackupCode(code.Id);

        var act = () => user.ConsumeBackupCode(code.Id);

        act.Should().Throw<DomainException>()
            .WithMessage("*already used*");
    }

    // ── Refresh tokens ────────────────────────────────────────────────────────

    [Fact]
    public void RevokeRefreshTokenFamily_ShouldOnlyRevokeMatchingFamily()
    {
        var user = User.Create("test@example.com", "hash", ["student"]);
        user.AddRefreshToken("hash-a1", "family-A", DateTimeOffset.UtcNow.AddDays(7));
        user.AddRefreshToken("hash-a2", "family-A", DateTimeOffset.UtcNow.AddDays(7));
        user.AddRefreshToken("hash-b1", "family-B", DateTimeOffset.UtcNow.AddDays(7));

        user.RevokeRefreshTokenFamily("family-A");

        user.RefreshTokens
            .Where(t => t.FamilyId == "family-A")
            .Should().AllSatisfy(t => t.IsRevoked.Should().BeTrue());

        user.RefreshTokens
            .Where(t => t.FamilyId == "family-B")
            .Should().AllSatisfy(t => t.IsRevoked.Should().BeFalse());
    }

    [Fact]
    public void RevokeAllRefreshTokens_ShouldRevokeAll_AndEmitLoggedOutEvent()
    {
        var user = User.Create("test@example.com", "hash", ["student"]);
        user.AddRefreshToken("hash-1", "family-A", DateTimeOffset.UtcNow.AddDays(7));
        user.AddRefreshToken("hash-2", "family-B", DateTimeOffset.UtcNow.AddDays(7));
        user.ClearDomainEvents();

        user.RevokeAllRefreshTokens();

        user.RefreshTokens.Should().AllSatisfy(t => t.IsRevoked.Should().BeTrue());
        user.DomainEvents.Should().ContainSingle()
            .Which.Should().BeOfType<UserLoggedOutEvent>();
    }

    [Fact]
    public void ChangePassword_ShouldRevokeAllSessions()
    {
        var user = User.Create("test@example.com", "hash", ["student"]);
        user.AddRefreshToken("hash-1", "family-A", DateTimeOffset.UtcNow.AddDays(7));

        user.ChangePassword("new-hash");

        user.PasswordHash.Should().Be("new-hash");
        user.RefreshTokens.Should().AllSatisfy(t => t.IsRevoked.Should().BeTrue());
    }

    // ── AssignRole ────────────────────────────────────────────────────────────

    [Fact]
    public void AssignRole_ShouldAddRole()
    {
        var user = User.Create("test@example.com", "hash", ["student"]);
        var role = Role.Create("Admin");

        user.AssignRole(role);

        user.Roles.Should().ContainSingle(r => r.RoleId == role.Id);
    }

    [Fact]
    public void AssignRole_Duplicate_ShouldNotAddTwice()
    {
        var user = User.Create("test@example.com", "hash", ["student"]);
        var role = Role.Create("Admin");

        user.AssignRole(role);
        user.AssignRole(role); // duplicate

        user.Roles.Should().HaveCount(1);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static User CreateUserWith2FA()
    {
        var user = User.Create("test@example.com", "hash", ["student"]);
        user.SetTotpSecret("encrypted-secret");
        user.ConfirmTotpVerification();
        user.EnableTwoFactor(CreateBackupCodes(user.Id, 8));
        return user;
    }

    private static List<BackupCode> CreateBackupCodes(Guid userId, int count) =>
        Enumerable.Range(0, count)
            .Select(_ => BackupCode.Create(userId, $"hash-{Guid.NewGuid()}"))
            .ToList();
}
