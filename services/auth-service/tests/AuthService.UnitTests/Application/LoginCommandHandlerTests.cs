using AuthService.Application.Commands;
using AuthService.Application.DTOs;
using AuthService.Application.Interfaces;
using AuthService.Application.Options;
using AuthService.Domain.Entities;
using AuthService.Domain.Exceptions;
using FluentAssertions;
using Microsoft.Extensions.Options;
using NSubstitute;
using Xunit;

namespace AuthService.UnitTests.Application;

public sealed class LoginCommandHandlerTests
{
    private readonly IUserRepository _userRepo = Substitute.For<IUserRepository>();
    private readonly IRoleRepository _roleRepo = Substitute.For<IRoleRepository>();
    private readonly IPasswordHasher _hasher = Substitute.For<IPasswordHasher>();
    private readonly ITokenService _tokenService = Substitute.For<ITokenService>();
    private readonly IDomainEventPublisher _publisher = Substitute.For<IDomainEventPublisher>();
    private readonly IUnitOfWork _unitOfWork = Substitute.For<IUnitOfWork>();

    private readonly IOptions<AuthOptions> _opts = Options.Create(new AuthOptions
    {
        MaxFailedLoginAttempts = 5,
        LockoutDurationMinutes = 15,
        AccessTokenLifetimeMinutes = 15,
        RefreshTokenLifetimeDays = 7,
    });

    private LoginCommandHandler CreateHandler() => new(
        _userRepo, _roleRepo, _hasher, _tokenService,
        _publisher, _unitOfWork, _opts);

    private User CreateUser(string email = "test@example.com", string hash = "hash")
    {
        var user = User.Create(email, hash);
        user.ClearDomainEvents();
        return user;
    }

    [Fact]
    public async Task Handle_ValidCredentials_ReturnsTokens()
    {
        var user = CreateUser();
        _userRepo.FindByEmailAsync("test@example.com", default).Returns(user);
        _hasher.Verify("Password1!", "hash").Returns(true);
        _roleRepo.GetRoleNamesForUserAsync(user.Id, default).Returns(["User"]);
        _tokenService.GenerateAccessToken(user.Id, user.Email, Arg.Any<IEnumerable<string>>())
            .Returns("access-token");
        _tokenService.GenerateRefreshToken()
            .Returns(("raw-token", "token-hash", "family-id"));
        _unitOfWork.SaveChangesAsync(default).Returns(1);

        var result = await CreateHandler().Handle(
            new LoginCommand("test@example.com", "Password1!"), default);

        result.Should().BeOfType<LoginSuccessResult>();
        var success = (LoginSuccessResult)result;
        success.Tokens.AccessToken.Should().Be("access-token");
        success.Tokens.RefreshToken.Should().Be("raw-token");
    }

    [Fact]
    public async Task Handle_UserNotFound_ShouldThrowInvalidCredentials()
    {
        _userRepo.FindByEmailAsync(Arg.Any<string>(), default)
            .Returns((User?)null);

        var act = async () => await CreateHandler().Handle(
            new LoginCommand("notfound@example.com", "Password1!"), default);

        await act.Should().ThrowAsync<InvalidCredentialsException>();
    }

    [Fact]
    public async Task Handle_WrongPassword_ShouldThrowInvalidCredentials()
    {
        var user = CreateUser();
        _userRepo.FindByEmailAsync(Arg.Any<string>(), default).Returns(user);
        _hasher.Verify(Arg.Any<string>(), Arg.Any<string>()).Returns(false);
        _unitOfWork.SaveChangesAsync(default).Returns(1);

        var act = async () => await CreateHandler().Handle(
            new LoginCommand("test@example.com", "WrongPassword!"), default);

        await act.Should().ThrowAsync<InvalidCredentialsException>();
        user.FailedLoginAttempts.Should().Be(1);
    }

    [Fact]
    public async Task Handle_LockedAccount_ShouldThrowAccountLockedException()
    {
        var user = CreateUser();
        for (var i = 0; i < 5; i++)
            user.RecordFailedLogin(5, TimeSpan.FromMinutes(15));

        _userRepo.FindByEmailAsync(Arg.Any<string>(), default).Returns(user);
        _hasher.Verify(Arg.Any<string>(), Arg.Any<string>()).Returns(true);

        var act = async () => await CreateHandler().Handle(
            new LoginCommand("test@example.com", "Password1!"), default);

        await act.Should().ThrowAsync<AccountLockedException>();
    }

    [Fact]
    public async Task Handle_UserWith2FA_ShouldReturnMfaChallenge()
    {
        var user = CreateUser();
        user.SetTotpSecret("encrypted");
        user.ConfirmTotpVerification();
        user.EnableTwoFactor(
            Enumerable.Range(0, 8)
                .Select(_ => BackupCode.Create(user.Id, "code-hash"))
                .ToList());

        _userRepo.FindByEmailAsync(Arg.Any<string>(), default).Returns(user);
        _hasher.Verify(Arg.Any<string>(), Arg.Any<string>()).Returns(true);
        _tokenService.GenerateMfaChallengeToken(user.Id).Returns("mfa-challenge-token");

        var result = await CreateHandler().Handle(
            new LoginCommand("test@example.com", "Password1!"), default);

        result.Should().BeOfType<MfaRequiredResult>();
        var mfa = (MfaRequiredResult)result;
        mfa.Challenge.MfaChallengeToken.Should().Be("mfa-challenge-token");
    }
}