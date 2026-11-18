using AuthService.Application.Commands;
using AuthService.Application.Interfaces;
using AuthService.Application.Options;
using AuthService.Application.Services;
using AuthService.Domain.Entities;
using AuthService.Domain.Events;
using AuthService.Domain.Exceptions;
using FluentAssertions;
using Microsoft.Extensions.Options;
using NSubstitute;
using Xunit;

namespace AuthService.UnitTests.Application;

/// <summary>
/// Plan 90, phase 6, step 1: a blocked account gets no session on any path that hands one out —
/// password sign-in, MFA code, backup code, refresh, the email link, and the admin panel's own
/// sign-in and MFA setup.
/// </summary>
public sealed class AccountBlockSessionTests
{
    private readonly IUserRepository _userRepo = Substitute.For<IUserRepository>();
    private readonly IRoleRepository _roleRepo = Substitute.For<IRoleRepository>();
    private readonly IAdminLevelRepository _levels = Substitute.For<IAdminLevelRepository>();
    private readonly IPasswordHasher _hasher = Substitute.For<IPasswordHasher>();
    private readonly ITokenService _tokenService = Substitute.For<ITokenService>();
    private readonly ITotpService _totp = Substitute.For<ITotpService>();
    private readonly IEncryptionService _encryption = Substitute.For<IEncryptionService>();
    private readonly IBackupCodeService _backupCodes = Substitute.For<IBackupCodeService>();
    private readonly IOtpReplayGuard _replayGuard = Substitute.For<IOtpReplayGuard>();
    private readonly IRefreshTokenRepository _refreshTokens = Substitute.For<IRefreshTokenRepository>();
    private readonly IDomainEventPublisher _publisher = Substitute.For<IDomainEventPublisher>();
    private readonly IRateLimitStore _rateLimitStore = Substitute.For<IRateLimitStore>();
    private readonly IUnitOfWork _unitOfWork = Substitute.For<IUnitOfWork>();
    private readonly IRefreshTokenLifetimeResolver _lifetimes = Substitute.For<IRefreshTokenLifetimeResolver>();
    private readonly MediatR.ISender _sender = Substitute.For<MediatR.ISender>();

    private readonly IOptions<AuthOptions> _opts = Options.Create(new AuthOptions
    {
        MaxFailedLoginAttempts = 5,
        LockoutDurationMinutes = 15,
        AccessTokenLifetimeMinutes = 15,
        RefreshTokenLifetimeDays = 7,
        LoginRateLimitMaxAttempts = 10,
        LoginRateLimitWindowSeconds = 300,
    });

    public AccountBlockSessionTests()
    {
        _lifetimes.ResolveAsync(
                Arg.Any<IReadOnlyCollection<string>>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(TimeSpan.FromDays(7));
        _tokenService.GenerateRefreshToken().Returns(("raw-token", "token-hash", "family-id"));
        _tokenService.GenerateMfaChallengeToken(Arg.Any<Guid>()).Returns("mfa-challenge");
        _hasher.Verify("Password1!", "hash").Returns(true);
    }

    private AdminSessionGate Gate => new(_levels);

    private static User CreateUser(
        string role = RoleNames.Student, bool withMfa = false, bool verified = true, bool blocked = true)
    {
        var user = User.Create("user@example.com", "hash", [role]);
        if (verified) user.VerifyEmail();
        if (withMfa)
        {
            user.SetTotpSecret("encrypted-secret");
            user.ConfirmTotpVerification();
            user.EnableTwoFactor([BackupCode.Create(user.Id, "backup-hash")]);
        }
        if (blocked) user.Block(Guid.NewGuid(), "reason", DateTimeOffset.UtcNow);
        user.ClearDomainEvents();
        return user;
    }

    private void GivenRoles(User user, params string[] roles) =>
        _roleRepo.GetRoleNamesForUserAsync(user.Id, Arg.Any<CancellationToken>()).Returns([.. roles]);

    private void GivenLevel(User user, string level) =>
        _levels.FindAsync(user.Id, Arg.Any<CancellationToken>())
            .Returns(AdminLevelAssignment.Create(user.Id, level, DateTimeOffset.UtcNow));

    private void ThenNoSessionWasIssued()
    {
        _tokenService.DidNotReceiveWithAnyArgs().GenerateAccessToken(default, default!, default!, default);
        _userRepo.DidNotReceiveWithAnyArgs().AddRefreshToken(default!);
    }

    // ── Password sign-in ──────────────────────────────────────────────────────

    private LoginCommandHandler LoginHandler() => new(
        _userRepo, _roleRepo, _hasher, _tokenService, _publisher, _rateLimitStore,
        _unitOfWork, _opts, _lifetimes, Gate);

    [Fact]
    public async Task Login_RightPassword_IsRefused_AsBlocked()
    {
        var user = CreateUser();
        _userRepo.FindByEmailAsync("user@example.com", Arg.Any<CancellationToken>()).Returns(user);

        var act = () => LoginHandler().Handle(new LoginCommand("user@example.com", "Password1!"), default);

        await act.Should().ThrowAsync<AccountBlockedException>();
        ThenNoSessionWasIssued();
    }

    [Fact]
    public async Task Login_WrongPassword_DoesNotTellTheAccountIsBlocked()
    {
        var user = CreateUser();
        _userRepo.FindByEmailAsync("user@example.com", Arg.Any<CancellationToken>()).Returns(user);

        var act = () => LoginHandler().Handle(new LoginCommand("user@example.com", "wrong"), default);

        await act.Should().ThrowAsync<InvalidCredentialsException>();
    }

    [Fact]
    public async Task Login_WithMfa_GetsNoChallenge()
    {
        var user = CreateUser(withMfa: true);
        _userRepo.FindByEmailAsync("user@example.com", Arg.Any<CancellationToken>()).Returns(user);

        var act = () => LoginHandler().Handle(new LoginCommand("user@example.com", "Password1!"), default);

        await act.Should().ThrowAsync<AccountBlockedException>();
        _tokenService.DidNotReceiveWithAnyArgs().GenerateMfaChallengeToken(default);
    }

    [Fact]
    public async Task Login_AdminPanel_IsRefused_AsBlocked()
    {
        var user = CreateUser(role: RoleNames.PlatformAdmin, withMfa: true);
        _userRepo.FindByEmailAsync("user@example.com", Arg.Any<CancellationToken>()).Returns(user);
        GivenRoles(user, RoleNames.PlatformAdmin);
        GivenLevel(user, AdminLevels.Super);

        var act = () => LoginHandler().Handle(
            new LoginCommand("user@example.com", "Password1!", ClientType: ClientTypes.Admin), default);

        await act.Should().ThrowAsync<AccountBlockedException>();
        _tokenService.DidNotReceiveWithAnyArgs().GenerateMfaChallengeToken(default);
        _tokenService.DidNotReceiveWithAnyArgs().GenerateMfaSetupToken(default);
    }

    [Fact]
    public async Task Login_DoesNotCancelAPendingDeletion()
    {
        var user = User.Create("user@example.com", "hash", [RoleNames.Student]);
        user.VerifyEmail();
        user.RequestDeletion([RoleNames.Student]);
        user.Block(Guid.NewGuid(), "reason", DateTimeOffset.UtcNow);
        _userRepo.FindByEmailAsync("user@example.com", Arg.Any<CancellationToken>()).Returns(user);

        var act = () => LoginHandler().Handle(new LoginCommand("user@example.com", "Password1!"), default);

        await act.Should().ThrowAsync<AccountBlockedException>();
        user.DeletionRequestedAt.Should().NotBeNull();
    }

    // ── MFA code and backup code ──────────────────────────────────────────────

    private CompleteMfaLoginCommandHandler MfaHandler() => new(
        _userRepo, _roleRepo, _tokenService, _totp, _encryption, _publisher, _replayGuard,
        _unitOfWork, _opts, _lifetimes, Gate, _rateLimitStore);

    private LoginWithBackupCodeCommandHandler BackupHandler() => new(
        _userRepo, _roleRepo, _tokenService, _backupCodes, _publisher,
        _unitOfWork, _opts, _lifetimes, Gate, _rateLimitStore);

    private User GivenChallengeIssuedBeforeTheBlock()
    {
        var user = CreateUser(withMfa: true);
        _tokenService.ValidateMfaChallengeToken("mfa-challenge").Returns(user.Id);
        _userRepo.FindByIdWithTokensAsync(user.Id, Arg.Any<CancellationToken>()).Returns(user);
        _userRepo.FindByIdWithBackupCodesAsync(user.Id, Arg.Any<CancellationToken>()).Returns(user);
        _encryption.Decrypt("encrypted-secret").Returns("secret");
        _totp.ValidateCode("secret", "123456").Returns(true);
        _backupCodes.VerifyCode("ABCD-EFGH", "backup-hash").Returns(true);
        return user;
    }

    [Fact]
    public async Task MfaCode_IsRefused_AsBlocked()
    {
        GivenChallengeIssuedBeforeTheBlock();

        var act = () => MfaHandler().Handle(new CompleteMfaLoginCommand("mfa-challenge", "123456"), default);

        await act.Should().ThrowAsync<AccountBlockedException>();
        ThenNoSessionWasIssued();
        // Nothing is spent: the code is not marked used.
        await _replayGuard.DidNotReceiveWithAnyArgs().MarkAsUsedAsync(default!, default!, default);
    }

    [Fact]
    public async Task MfaCode_AdminPanel_IsRefused_AsBlocked()
    {
        var user = GivenChallengeIssuedBeforeTheBlock();
        GivenRoles(user, RoleNames.PlatformAdmin);
        GivenLevel(user, AdminLevels.Super);

        var act = () => MfaHandler().Handle(
            new CompleteMfaLoginCommand("mfa-challenge", "123456", ClientType: ClientTypes.Admin), default);

        await act.Should().ThrowAsync<AccountBlockedException>();
        ThenNoSessionWasIssued();
    }

    [Fact]
    public async Task BackupCode_IsRefused_AsBlocked_AndNotSpent()
    {
        var user = GivenChallengeIssuedBeforeTheBlock();

        var act = () => BackupHandler().Handle(
            new LoginWithBackupCodeCommand("mfa-challenge", "ABCD-EFGH"), default);

        await act.Should().ThrowAsync<AccountBlockedException>();
        ThenNoSessionWasIssued();
        user.BackupCodes.Should().OnlyContain(c => !c.IsUsed);
    }

    // ── Refresh ───────────────────────────────────────────────────────────────

    private RefreshTokenCommandHandler RefreshHandler() => new(
        _userRepo, _roleRepo, _refreshTokens, _tokenService, _unitOfWork, _opts, _lifetimes, Gate);

    [Theory]
    [InlineData(ClientTypes.Web, false)]
    [InlineData(ClientTypes.Mobile, false)]
    [InlineData(ClientTypes.Admin, true)]
    public async Task Refresh_EndsTheSession_AsBlocked(string clientType, bool adminRoute)
    {
        // A token that escaped the revocation (written before the block reached it) still dies here.
        var user = CreateUser(role: RoleNames.PlatformAdmin, withMfa: true, blocked: false);
        var token = user.AddRefreshToken(
            "stored-hash", "family-1", DateTimeOffset.UtcNow.AddDays(1), clientType: clientType);
        _refreshTokens.FindActiveByHashAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(token);
        _userRepo.FindByIdWithTokensAsync(user.Id, Arg.Any<CancellationToken>()).Returns(user);
        GivenRoles(user, RoleNames.PlatformAdmin);
        GivenLevel(user, AdminLevels.Super);
        // Blocked through the back door, so the token stays active the way a racing write would leave it.
        typeof(User).GetProperty(nameof(User.BlockedAt))!.SetValue(user, DateTimeOffset.UtcNow);

        var act = () => RefreshHandler().Handle(new RefreshTokenCommand("raw", adminRoute), default);

        await act.Should().ThrowAsync<AccountBlockedException>();
        token.IsRevoked.Should().BeTrue();
        await _unitOfWork.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
        ThenNoSessionWasIssued();
    }

    // ── Email verification link ───────────────────────────────────────────────

    private VerifyEmailCommandHandler VerifyEmailHandler() => new(
        _userRepo, _roleRepo, _tokenService, _publisher, _unitOfWork, _opts, _lifetimes);

    [Fact]
    public async Task VerifyEmail_ConfirmsTheAddress_ButOpensNoSession()
    {
        var user = CreateUser(verified: false);
        _tokenService.ValidateEmailVerificationToken("link").Returns(new EmailVerificationData(user.Id, null));
        _userRepo.FindByIdWithTokensAsync(user.Id, Arg.Any<CancellationToken>()).Returns(user);

        var act = () => VerifyEmailHandler().Handle(new VerifyEmailCommand("link"), default);

        await act.Should().ThrowAsync<AccountBlockedException>();
        user.EmailVerified.Should().BeTrue();
        await _unitOfWork.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
        await _publisher.Received(1).PublishAsync(Arg.Any<EmailVerifiedEvent>(), Arg.Any<CancellationToken>());
        ThenNoSessionWasIssued();
    }

    [Fact]
    public async Task VerifyEmail_AlreadyVerified_OpensNoSession()
    {
        // The link lives 24 h and used to open a web session on every visit.
        var user = CreateUser(verified: true);
        _tokenService.ValidateEmailVerificationToken("link").Returns(new EmailVerificationData(user.Id, null));
        _userRepo.FindByIdWithTokensAsync(user.Id, Arg.Any<CancellationToken>()).Returns(user);

        var act = () => VerifyEmailHandler().Handle(new VerifyEmailCommand("link"), default);

        await act.Should().ThrowAsync<AccountBlockedException>();
        ThenNoSessionWasIssued();
    }

    // ── Admin panel MFA setup ─────────────────────────────────────────────────

    private User GivenSetupToken()
    {
        var user = CreateUser(role: RoleNames.PlatformAdmin);
        _tokenService.ValidateMfaSetupToken("setup-token").Returns(user.Id);
        _userRepo.FindByIdWithTokensAsync(user.Id, Arg.Any<CancellationToken>()).Returns(user);
        GivenRoles(user, RoleNames.PlatformAdmin);
        GivenLevel(user, AdminLevels.Admin);
        return user;
    }

    [Fact]
    public async Task AdminMfaSetupStart_IsRefused_AsBlocked()
    {
        GivenSetupToken();

        var act = () => new StartAdminMfaSetupCommandHandler(_userRepo, _roleRepo, _tokenService, Gate, _sender)
            .Handle(new StartAdminMfaSetupCommand("setup-token"), default);

        await act.Should().ThrowAsync<AccountBlockedException>();
        await _sender.DidNotReceiveWithAnyArgs().Send(default(SetupTotpCommand)!, default);
    }

    [Fact]
    public async Task AdminMfaSetupConfirm_IsRefused_AsBlocked()
    {
        GivenSetupToken();

        var act = () => new ConfirmAdminMfaSetupCommandHandler(
                _userRepo, _roleRepo, _tokenService, Gate, _replayGuard, _rateLimitStore, _publisher,
                _unitOfWork, _opts, _lifetimes, _sender)
            .Handle(new ConfirmAdminMfaSetupCommand("setup-token", "123456"), default);

        await act.Should().ThrowAsync<AccountBlockedException>();
        await _sender.DidNotReceiveWithAnyArgs().Send(default(VerifyAndEnableTotpCommand)!, default);
        ThenNoSessionWasIssued();
    }
}
