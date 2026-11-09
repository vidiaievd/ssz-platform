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
    public async Task Login_AdminClient_WithoutMfa_IsRefused()
    {
        var user = CreateUser(withMfa: false);
        _userRepo.FindByEmailAsync("admin@example.com", Arg.Any<CancellationToken>()).Returns(user);
        GivenRoles(user, RoleNames.PlatformAdmin);
        GivenLevel(user, AdminLevels.Super);

        var act = () => LoginHandler().Handle(
            new LoginCommand("admin@example.com", "Password1!", ClientType: ClientTypes.Admin), default);

        await act.Should().ThrowAsync<MfaSetupRequiredException>();
        _userRepo.DidNotReceiveWithAnyArgs().AddRefreshToken(default!);
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
        _unitOfWork, _opts, _lifetimes, Gate);

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

    // ── Refresh ───────────────────────────────────────────────────────────────

    private RefreshTokenCommandHandler RefreshHandler() => new(
        _userRepo, _roleRepo, _refreshTokens, _tokenService, _unitOfWork, _opts, _lifetimes, Gate);

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

        await RefreshHandler().Handle(new RefreshTokenCommand("raw"), default);

        _tokenService.Received(1).GenerateAccessToken(
            user.Id, user.Email, Arg.Any<IEnumerable<string>>(), AdminLevels.Super);
    }

    [Fact]
    public async Task Refresh_AdminSession_LevelWithdrawn_EndsTheSession()
    {
        var user = GivenAdminSession();
        GivenRoles(user, RoleNames.PlatformAdmin);

        var act = () => RefreshHandler().Handle(new RefreshTokenCommand("raw"), default);

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

        var act = () => RefreshHandler().Handle(new RefreshTokenCommand("raw"), default);

        await act.Should().ThrowAsync<MfaSetupRequiredException>();
        user.RefreshTokens.Should().OnlyContain(t => t.IsRevoked);
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
