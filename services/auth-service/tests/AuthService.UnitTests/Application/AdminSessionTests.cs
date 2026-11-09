using AuthService.Application.Commands;
using AuthService.Application.Interfaces;
using AuthService.Application.Options;
using AuthService.Application.Services;
using AuthService.Domain.Entities;
using AuthService.Domain.Exceptions;
using FluentAssertions;
using Microsoft.Extensions.Options;
using NSubstitute;
using Xunit;

namespace AuthService.UnitTests.Application;

/// <summary>
/// Plan 90: an admin-panel session — client `admin` — is opened only through MFA, only by a
/// platform administrator with a level, and only its access tokens carry `admin_level`.
/// </summary>
public sealed class AdminSessionTests
{
    private readonly IUserRepository _userRepo = Substitute.For<IUserRepository>();
    private readonly IRoleRepository _roleRepo = Substitute.For<IRoleRepository>();
    private readonly IAdminLevelRepository _levels = Substitute.For<IAdminLevelRepository>();
    private readonly IPasswordHasher _hasher = Substitute.For<IPasswordHasher>();
    private readonly ITokenService _tokenService = Substitute.For<ITokenService>();
    private readonly ITotpService _totp = Substitute.For<ITotpService>();
    private readonly IEncryptionService _encryption = Substitute.For<IEncryptionService>();
    private readonly IOtpReplayGuard _replayGuard = Substitute.For<IOtpReplayGuard>();
    private readonly IRefreshTokenRepository _refreshTokens = Substitute.For<IRefreshTokenRepository>();
    private readonly IDomainEventPublisher _publisher = Substitute.For<IDomainEventPublisher>();
    private readonly IRateLimitStore _rateLimitStore = Substitute.For<IRateLimitStore>();
    private readonly IUnitOfWork _unitOfWork = Substitute.For<IUnitOfWork>();
    private readonly IRefreshTokenLifetimeResolver _lifetimes = Substitute.For<IRefreshTokenLifetimeResolver>();

    private readonly IOptions<AuthOptions> _opts = Options.Create(new AuthOptions
    {
        MaxFailedLoginAttempts = 5,
        LockoutDurationMinutes = 15,
        AccessTokenLifetimeMinutes = 15,
        RefreshTokenLifetimeDays = 7,
        LoginRateLimitMaxAttempts = 10,
        LoginRateLimitWindowSeconds = 300,
    });

    public AdminSessionTests()
    {
        _lifetimes.ResolveAsync(
                Arg.Any<IReadOnlyCollection<string>>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(TimeSpan.FromHours(12));
        _tokenService.GenerateRefreshToken().Returns(("raw-token", "token-hash", "family-id"));
        _tokenService.GenerateMfaChallengeToken(Arg.Any<Guid>()).Returns("mfa-challenge");
        _hasher.Verify("Password1!", "hash").Returns(true);
    }

    private AdminSessionGate Gate => new(_levels);

    private static User CreateUser(bool withMfa)
    {
        var user = User.Create("admin@example.com", "hash", [RoleNames.PlatformAdmin]);
        user.VerifyEmail();
        if (withMfa)
        {
            user.SetTotpSecret("encrypted-secret");
            user.ConfirmTotpVerification();
            user.EnableTwoFactor([]);
        }
        user.ClearDomainEvents();
        return user;
    }

    private void GivenRoles(User user, params string[] roles) =>
        _roleRepo.GetRoleNamesForUserAsync(user.Id, Arg.Any<CancellationToken>()).Returns([.. roles]);

    private void GivenLevel(User user, string level) =>
        _levels.FindAsync(user.Id, Arg.Any<CancellationToken>())
            .Returns(AdminLevelAssignment.Create(user.Id, level, DateTimeOffset.UtcNow));

    // ── The gate ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task Gate_NotAPlatformAdmin_IsDenied_EvenWithALevelRow()
    {
        var user = CreateUser(withMfa: true);
        GivenLevel(user, AdminLevels.Super);

        var act = () => Gate.AdmitAsync(user, [RoleNames.Student]);

        await act.Should().ThrowAsync<AdminAccessDeniedException>();
    }

    [Fact]
    public async Task Gate_PlatformAdminWithoutALevel_IsDenied()
    {
        var user = CreateUser(withMfa: true);

        var act = () => Gate.AdmitAsync(user, [RoleNames.PlatformAdmin]);

        await act.Should().ThrowAsync<AdminAccessDeniedException>();
    }

    [Fact]
    public async Task Gate_AdministratorWithoutMfa_MustSetItUp()
    {
        var user = CreateUser(withMfa: false);
        GivenLevel(user, AdminLevels.Admin);

        var act = () => Gate.AdmitAsync(user, [RoleNames.PlatformAdmin]);

        await act.Should().ThrowAsync<MfaSetupRequiredException>();
    }

    [Fact]
    public async Task Gate_AdministratorWithLevelAndMfa_GetsTheLevel()
    {
        var user = CreateUser(withMfa: true);
        GivenLevel(user, AdminLevels.Support);

        var level = await Gate.AdmitAsync(user, [RoleNames.Student, RoleNames.PlatformAdmin]);

        level.Should().Be(AdminLevels.Support);
    }

    // ── Sign-in ───────────────────────────────────────────────────────────────

    private LoginCommandHandler LoginHandler() => new(
        _userRepo, _roleRepo, _hasher, _tokenService, _publisher, _rateLimitStore,
        _unitOfWork, _opts, _lifetimes, Gate);

    [Fact]
    public async Task Login_AdminClient_WithMfa_AsksForTheCode_AndIssuesNoTokens()
    {
        var user = CreateUser(withMfa: true);
        _userRepo.FindByEmailAsync("admin@example.com", Arg.Any<CancellationToken>()).Returns(user);
        GivenRoles(user, RoleNames.PlatformAdmin);
        GivenLevel(user, AdminLevels.Admin);

        var result = await LoginHandler().Handle(
            new LoginCommand("admin@example.com", "Password1!", ClientType: ClientTypes.Admin), default);

        result.Should().BeOfType<MfaRequiredResult>();
        _tokenService.DidNotReceiveWithAnyArgs().GenerateAccessToken(default, default!, default!, default);
    }

    [Fact]
    public async Task Login_AdminClient_WithoutMfa_GetsOnlyASetupToken()
    {
        var user = CreateUser(withMfa: false);
        _userRepo.FindByEmailAsync("admin@example.com", Arg.Any<CancellationToken>()).Returns(user);
        GivenRoles(user, RoleNames.PlatformAdmin);
        GivenLevel(user, AdminLevels.Super);
        _tokenService.GenerateMfaSetupToken(user.Id).Returns("setup-token");

        var result = await LoginHandler().Handle(
            new LoginCommand("admin@example.com", "Password1!", ClientType: ClientTypes.Admin), default);

        result.Should().BeOfType<MfaSetupRequiredResult>()
            .Which.Setup.MfaSetupToken.Should().Be("setup-token");
        _userRepo.DidNotReceiveWithAnyArgs().AddRefreshToken(default!);
        _tokenService.DidNotReceiveWithAnyArgs().GenerateAccessToken(default, default!, default!, default);
    }

    [Fact]
    public async Task Login_AdminClient_NotAnAdministrator_IsRefused()
    {
        var user = CreateUser(withMfa: true);
        _userRepo.FindByEmailAsync("admin@example.com", Arg.Any<CancellationToken>()).Returns(user);
        GivenRoles(user, RoleNames.Teacher);

        var act = () => LoginHandler().Handle(
            new LoginCommand("admin@example.com", "Password1!", ClientType: ClientTypes.Admin), default);

        await act.Should().ThrowAsync<AdminAccessDeniedException>();
    }

    [Fact]
    public async Task Login_WebClient_OfAnAdministrator_CarriesNoLevel()
    {
        var user = CreateUser(withMfa: false);
        _userRepo.FindByEmailAsync("admin@example.com", Arg.Any<CancellationToken>()).Returns(user);
        GivenRoles(user, RoleNames.PlatformAdmin);
        GivenLevel(user, AdminLevels.Super);

        await LoginHandler().Handle(new LoginCommand("admin@example.com", "Password1!"), default);

        _tokenService.Received(1).GenerateAccessToken(
            user.Id, user.Email, Arg.Any<IEnumerable<string>>(), null);
    }

    // ── The MFA code ──────────────────────────────────────────────────────────

    private CompleteMfaLoginCommandHandler MfaHandler() => new(
        _userRepo, _roleRepo, _tokenService, _totp, _encryption, _publisher, _replayGuard,
        _unitOfWork, _opts, _lifetimes, Gate, _rateLimitStore);

    private User GivenMfaChallenge()
    {
        var user = CreateUser(withMfa: true);
        _tokenService.ValidateMfaChallengeToken("mfa-challenge").Returns(user.Id);
        _userRepo.FindByIdWithTokensAsync(user.Id, Arg.Any<CancellationToken>()).Returns(user);
        _encryption.Decrypt("encrypted-secret").Returns("secret");
        _totp.ValidateCode("secret", "123456").Returns(true);
        return user;
    }

    [Fact]
    public async Task Mfa_AdminClient_IssuesTheLevel_AndAnAdminSession()
    {
        var user = GivenMfaChallenge();
        GivenRoles(user, RoleNames.PlatformAdmin);
        GivenLevel(user, AdminLevels.Admin);
        RefreshToken? issued = null;
        _userRepo.AddRefreshToken(Arg.Do<RefreshToken>(t => issued = t));

        await MfaHandler().Handle(
            new CompleteMfaLoginCommand("mfa-challenge", "123456", ClientType: ClientTypes.Admin), default);

        _tokenService.Received(1).GenerateAccessToken(
            user.Id, user.Email, Arg.Any<IEnumerable<string>>(), AdminLevels.Admin);
        issued!.ClientType.Should().Be(ClientTypes.Admin);
    }

    [Fact]
    public async Task Mfa_AdminClient_NotAnAdministrator_IsRefused()
    {
        // A challenge from an ordinary web sign-in cannot be finished as an admin session.
        var user = GivenMfaChallenge();
        GivenRoles(user, RoleNames.Student);

        var act = () => MfaHandler().Handle(
            new CompleteMfaLoginCommand("mfa-challenge", "123456", ClientType: ClientTypes.Admin), default);

        await act.Should().ThrowAsync<AdminAccessDeniedException>();
        _userRepo.DidNotReceiveWithAnyArgs().AddRefreshToken(default!);
    }

    [Fact]
    public async Task Mfa_AdminClient_WrongCode_IsCounted()
    {
        GivenMfaChallenge();

        var act = () => MfaHandler().Handle(
            new CompleteMfaLoginCommand("mfa-challenge", "000000", ClientType: ClientTypes.Admin), default);

        await act.Should().ThrowAsync<InvalidTotpCodeException>();
        await _rateLimitStore.Received(1).RecordAttemptAsync(
            Arg.Is<string>(k => k.StartsWith("mfa:attempts:")), 5, TimeSpan.FromMinutes(15), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Mfa_AdminClient_TooManyWrongCodes_TakesNoMore()
    {
        var user = GivenMfaChallenge();
        _rateLimitStore.IsLockedOutAsync($"mfa:attempts:{user.Id}", Arg.Any<CancellationToken>()).Returns(true);

        var act = () => MfaHandler().Handle(
            new CompleteMfaLoginCommand("mfa-challenge", "123456", ClientType: ClientTypes.Admin), default);

        await act.Should().ThrowAsync<AccountLockedException>();
        _totp.DidNotReceiveWithAnyArgs().ValidateCode(default!, default!);
    }

    [Fact]
    public async Task Mfa_WebClient_WrongCode_IsCountedToo()
    {
        // One count per account across clients: guesses cannot be spread between web and panel.
        var user = GivenMfaChallenge();

        var act = () => MfaHandler().Handle(
            new CompleteMfaLoginCommand("mfa-challenge", "000000"), default);

        await act.Should().ThrowAsync<InvalidTotpCodeException>();
        await _rateLimitStore.Received(1).RecordAttemptAsync(
            $"mfa:attempts:{user.Id}", 5, TimeSpan.FromMinutes(15), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Mfa_MobileClient_Locked_TakesNoCode()
    {
        var user = GivenMfaChallenge();
        _rateLimitStore.IsLockedOutAsync($"mfa:attempts:{user.Id}", Arg.Any<CancellationToken>()).Returns(true);

        var act = () => MfaHandler().Handle(
            new CompleteMfaLoginCommand("mfa-challenge", "123456", ClientType: ClientTypes.Mobile), default);

        await act.Should().ThrowAsync<AccountLockedException>();
        _userRepo.DidNotReceiveWithAnyArgs().AddRefreshToken(default!);
    }

    [Fact]
    public async Task Mfa_RightCode_ClearsTheCount()
    {
        var user = GivenMfaChallenge();
        GivenRoles(user, RoleNames.Student);

        await MfaHandler().Handle(new CompleteMfaLoginCommand("mfa-challenge", "123456"), default);

        await _rateLimitStore.Received(1).ResetAsync($"mfa:attempts:{user.Id}", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task DisableMfa_WrongCode_IsCounted_AndLockedTakesNoMore()
    {
        var user = CreateUser(withMfa: true);
        _userRepo.FindByIdAsync(user.Id, Arg.Any<CancellationToken>()).Returns(user);
        _encryption.Decrypt("encrypted-secret").Returns("secret");
        var handler = new DisableTwoFactorCommandHandler(
            _userRepo, _totp, _encryption, _publisher, _unitOfWork, _rateLimitStore, _opts);

        var wrong = () => handler.Handle(new DisableTwoFactorCommand(user.Id, "000000"), default);
        await wrong.Should().ThrowAsync<InvalidTotpCodeException>();
        await _rateLimitStore.Received(1).RecordAttemptAsync(
            $"mfa:attempts:{user.Id}", 5, TimeSpan.FromMinutes(15), Arg.Any<CancellationToken>());

        _rateLimitStore.IsLockedOutAsync($"mfa:attempts:{user.Id}", Arg.Any<CancellationToken>()).Returns(true);
        _totp.ValidateCode("secret", "123456").Returns(true);
        var locked = () => handler.Handle(new DisableTwoFactorCommand(user.Id, "123456"), default);
        await locked.Should().ThrowAsync<AccountLockedException>();
        user.TwoFactorEnabled.Should().BeTrue();
    }

    // ── Refresh ───────────────────────────────────────────────────────────────

    private RefreshTokenCommandHandler RefreshHandler() => new(
        _userRepo, _roleRepo, _refreshTokens, _tokenService, _unitOfWork, _opts, _lifetimes, Gate);

    private static readonly RefreshTokenCommand AdminRefresh = new("raw", AdminSession: true);

    private User GivenAdminSession(bool withMfa = true)
    {
        var user = CreateUser(withMfa);
        var token = user.AddRefreshToken(
            "stored-hash", "family-1", DateTimeOffset.UtcNow.AddHours(12), clientType: ClientTypes.Admin);
        _refreshTokens.FindActiveByHashAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(token);
        _userRepo.FindByIdWithTokensAsync(user.Id, Arg.Any<CancellationToken>()).Returns(user);
        return user;
    }

    [Fact]
    public async Task Refresh_AdminSession_KeepsTheLevel()
    {
        var user = GivenAdminSession();
        GivenRoles(user, RoleNames.PlatformAdmin);
        GivenLevel(user, AdminLevels.Super);

        await RefreshHandler().Handle(AdminRefresh, default);

        _tokenService.Received(1).GenerateAccessToken(
            user.Id, user.Email, Arg.Any<IEnumerable<string>>(), AdminLevels.Super);
    }

    [Fact]
    public async Task Refresh_AdminSession_LevelWithdrawn_EndsTheSession()
    {
        var user = GivenAdminSession();
        GivenRoles(user, RoleNames.PlatformAdmin);

        var act = () => RefreshHandler().Handle(AdminRefresh, default);

        await act.Should().ThrowAsync<AdminAccessDeniedException>();
        user.RefreshTokens.Should().OnlyContain(t => t.IsRevoked);
        await _unitOfWork.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
        _tokenService.DidNotReceiveWithAnyArgs().GenerateAccessToken(default, default!, default!, default);
    }

    [Fact]
    public async Task Refresh_AdminSession_MfaTurnedOff_EndsTheSession()
    {
        var user = GivenAdminSession(withMfa: false);
        GivenRoles(user, RoleNames.PlatformAdmin);
        GivenLevel(user, AdminLevels.Admin);

        var act = () => RefreshHandler().Handle(AdminRefresh, default);

        await act.Should().ThrowAsync<MfaSetupRequiredException>();
        user.RefreshTokens.Should().OnlyContain(t => t.IsRevoked);
    }

    [Fact]
    public async Task Refresh_AdminSession_OnTheBodyRoute_IsRefused()
    {
        var user = GivenAdminSession();
        GivenRoles(user, RoleNames.PlatformAdmin);
        GivenLevel(user, AdminLevels.Super);

        var act = () => RefreshHandler().Handle(new RefreshTokenCommand("raw"), default);

        await act.Should().ThrowAsync<InvalidTokenException>();
        _tokenService.DidNotReceiveWithAnyArgs().GenerateAccessToken(default, default!, default!, default);
    }

    [Fact]
    public async Task Refresh_WebSession_OnTheAdminRoute_IsRefused()
    {
        var user = CreateUser(withMfa: true);
        var token = user.AddRefreshToken("stored-hash", "family-1", DateTimeOffset.UtcNow.AddDays(7));
        _refreshTokens.FindActiveByHashAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(token);

        var act = () => RefreshHandler().Handle(AdminRefresh, default);

        await act.Should().ThrowAsync<InvalidTokenException>();
    }

    // ── MFA setup from the panel ──────────────────────────────────────────────

    private readonly MediatR.ISender _sender = Substitute.For<MediatR.ISender>();

    private User GivenSetupToken(bool withMfa = false, string role = RoleNames.PlatformAdmin)
    {
        var user = CreateUser(withMfa);
        _tokenService.ValidateMfaSetupToken("setup-token").Returns(user.Id);
        _userRepo.FindByIdWithTokensAsync(user.Id, Arg.Any<CancellationToken>()).Returns(user);
        GivenRoles(user, role);
        GivenLevel(user, AdminLevels.Admin);
        return user;
    }

    private StartAdminMfaSetupCommandHandler StartSetupHandler() =>
        new(_userRepo, _roleRepo, _tokenService, Gate, _sender);

    private ConfirmAdminMfaSetupCommandHandler ConfirmSetupHandler() => new(
        _userRepo, _roleRepo, _tokenService, Gate, _replayGuard, _rateLimitStore, _publisher,
        _unitOfWork, _opts, _lifetimes, _sender);

    [Fact]
    public async Task SetupStart_HandsOutTheSecret()
    {
        var user = GivenSetupToken();
        var setup = new AuthService.Application.DTOs.TotpSetupResponse("secret", "otpauth://x", [1]);
        _sender.Send(Arg.Is<SetupTotpCommand>(c => c.UserId == user.Id), Arg.Any<CancellationToken>())
            .Returns(setup);

        var result = await StartSetupHandler().Handle(new StartAdminMfaSetupCommand("setup-token"), default);

        result.Should().BeSameAs(setup);
    }

    [Fact]
    public async Task SetupStart_MfaAlreadyOn_IsRefused()
    {
        // A setup token must not re-enrol someone who has a second factor already.
        GivenSetupToken(withMfa: true);

        var act = () => StartSetupHandler().Handle(new StartAdminMfaSetupCommand("setup-token"), default);

        (await act.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("MFA_ALREADY_ENABLED");
        await _sender.DidNotReceiveWithAnyArgs().Send(default(SetupTotpCommand)!, default);
    }

    [Fact]
    public async Task SetupStart_NotAnAdministrator_IsRefused()
    {
        GivenSetupToken(role: RoleNames.Teacher);

        var act = () => StartSetupHandler().Handle(new StartAdminMfaSetupCommand("setup-token"), default);

        await act.Should().ThrowAsync<AdminAccessDeniedException>();
    }

    [Fact]
    public async Task SetupStart_BadToken_IsRefused()
    {
        var act = () => StartSetupHandler().Handle(new StartAdminMfaSetupCommand("forged"), default);

        await act.Should().ThrowAsync<InvalidTokenException>();
    }

    [Fact]
    public async Task SetupConfirm_TurnsMfaOn_AndOpensTheAdminSession()
    {
        var user = GivenSetupToken();
        _sender.Send(Arg.Any<VerifyAndEnableTotpCommand>(), Arg.Any<CancellationToken>())
            .Returns(_ =>
            {
                user.SetTotpSecret("encrypted-secret");
                user.ConfirmTotpVerification();
                user.EnableTwoFactor([]);
                return new AuthService.Application.DTOs.Enable2FAResponse(["b1", "b2"]);
            });
        RefreshToken? issued = null;
        _userRepo.AddRefreshToken(Arg.Do<RefreshToken>(t => issued = t));

        var result = await ConfirmSetupHandler().Handle(
            new ConfirmAdminMfaSetupCommand("setup-token", "123456"), default);

        result.BackupCodes.Should().Equal("b1", "b2");
        issued!.ClientType.Should().Be(ClientTypes.Admin);
        _tokenService.Received(1).GenerateAccessToken(
            user.Id, user.Email, Arg.Any<IEnumerable<string>>(), AdminLevels.Admin);
        await _replayGuard.Received(1).MarkAsUsedAsync(user.Id.ToString(), "123456", Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task SetupConfirm_WrongCode_IsCounted_AndOpensNothing()
    {
        GivenSetupToken();
        _sender.Send(Arg.Any<VerifyAndEnableTotpCommand>(), Arg.Any<CancellationToken>())
            .Returns<AuthService.Application.DTOs.Enable2FAResponse>(_ => throw new InvalidTotpCodeException());

        var act = () => ConfirmSetupHandler().Handle(
            new ConfirmAdminMfaSetupCommand("setup-token", "000000"), default);

        await act.Should().ThrowAsync<InvalidTotpCodeException>();
        await _rateLimitStore.Received(1).RecordAttemptAsync(
            Arg.Is<string>(k => k.StartsWith("mfa:attempts:")), 5, TimeSpan.FromMinutes(15), Arg.Any<CancellationToken>());
        _userRepo.DidNotReceiveWithAnyArgs().AddRefreshToken(default!);
    }

    // ── Sign-out ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task EndSession_RevokesOnlyThatAdminSession()
    {
        var user = CreateUser(withMfa: true);
        var admin = user.AddRefreshToken("h1", "family-admin", DateTimeOffset.UtcNow.AddHours(12), clientType: ClientTypes.Admin);
        var web = user.AddRefreshToken("h2", "family-web", DateTimeOffset.UtcNow.AddDays(7));
        _refreshTokens.FindActiveByHashAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(admin);
        _userRepo.FindByIdWithTokensAsync(user.Id, Arg.Any<CancellationToken>()).Returns(user);

        await new EndAdminSessionCommandHandler(_refreshTokens, _userRepo, _unitOfWork)
            .Handle(new EndAdminSessionCommand("raw"), default);

        admin.IsRevoked.Should().BeTrue();
        web.IsRevoked.Should().BeFalse();
    }

    [Fact]
    public async Task EndSession_IgnoresAWebToken()
    {
        var user = CreateUser(withMfa: true);
        var web = user.AddRefreshToken("h2", "family-web", DateTimeOffset.UtcNow.AddDays(7));
        _refreshTokens.FindActiveByHashAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(web);

        await new EndAdminSessionCommandHandler(_refreshTokens, _userRepo, _unitOfWork)
            .Handle(new EndAdminSessionCommand("raw"), default);

        web.IsRevoked.Should().BeFalse();
        await _unitOfWork.DidNotReceiveWithAnyArgs().SaveChangesAsync(default);
    }

    // ── Bootstrap ─────────────────────────────────────────────────────────────

    private BootstrapSuperAdminCommandHandler BootstrapHandler() =>
        new(_userRepo, _roleRepo, _levels, _unitOfWork);

    [Fact]
    public async Task Bootstrap_MakesTheAccountASuperAdministrator()
    {
        var user = User.Create("owner@example.com", "hash", [RoleNames.Student]);
        var role = Role.Create(RoleNames.PlatformAdmin);
        _userRepo.FindByEmailAsync("owner@example.com", Arg.Any<CancellationToken>()).Returns(user);
        _roleRepo.FindByNameAsync(RoleNames.PlatformAdmin, Arg.Any<CancellationToken>()).Returns(role);
        AdminLevelAssignment? added = null;
        _levels.Add(Arg.Do<AdminLevelAssignment>(a => added = a));

        var result = await BootstrapHandler().Handle(
            new BootstrapSuperAdminCommand(" Owner@Example.com "), default);

        result.Changed.Should().BeTrue();
        user.Roles.Should().ContainSingle(r => r.RoleId == role.Id);
        added!.Level.Should().Be(AdminLevels.Super);
        added.GrantedBy.Should().BeNull();
        await _unitOfWork.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Bootstrap_AlreadySuper_ChangesNothing()
    {
        var user = User.Create("owner@example.com", "hash", [RoleNames.Student]);
        var role = Role.Create(RoleNames.PlatformAdmin);
        user.AssignRole(role);
        _userRepo.FindByEmailAsync("owner@example.com", Arg.Any<CancellationToken>()).Returns(user);
        _roleRepo.FindByNameAsync(RoleNames.PlatformAdmin, Arg.Any<CancellationToken>()).Returns(role);
        GivenLevel(user, AdminLevels.Super);

        var result = await BootstrapHandler().Handle(
            new BootstrapSuperAdminCommand("owner@example.com"), default);

        result.Changed.Should().BeFalse();
        await _unitOfWork.DidNotReceiveWithAnyArgs().SaveChangesAsync(default);
    }

    [Fact]
    public async Task Bootstrap_RaisesALowerLevelToSuper()
    {
        var user = User.Create("owner@example.com", "hash", [RoleNames.Student]);
        var role = Role.Create(RoleNames.PlatformAdmin);
        user.AssignRole(role);
        var assignment = AdminLevelAssignment.Create(user.Id, AdminLevels.Support, DateTimeOffset.UtcNow);
        _userRepo.FindByEmailAsync("owner@example.com", Arg.Any<CancellationToken>()).Returns(user);
        _roleRepo.FindByNameAsync(RoleNames.PlatformAdmin, Arg.Any<CancellationToken>()).Returns(role);
        _levels.FindAsync(user.Id, Arg.Any<CancellationToken>()).Returns(assignment);

        await BootstrapHandler().Handle(new BootstrapSuperAdminCommand("owner@example.com"), default);

        assignment.Level.Should().Be(AdminLevels.Super);
        _levels.DidNotReceiveWithAnyArgs().Add(default!);
    }

    [Fact]
    public async Task Bootstrap_UnknownEmail_IsRefused()
    {
        var act = () => BootstrapHandler().Handle(new BootstrapSuperAdminCommand("nobody@example.com"), default);

        await act.Should().ThrowAsync<UserNotFoundException>();
    }
}
