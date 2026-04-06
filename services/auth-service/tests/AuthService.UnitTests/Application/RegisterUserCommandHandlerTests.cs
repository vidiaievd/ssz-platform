using AuthService.Application.Commands;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using AuthService.Domain.Events;
using AuthService.Domain.Exceptions;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace AuthService.UnitTests.Application;

public sealed class RegisterUserCommandHandlerTests
{
    private readonly IUserRepository _userRepo = Substitute.For<IUserRepository>();
    private readonly IRoleRepository _roleRepo = Substitute.For<IRoleRepository>();
    private readonly IPasswordHasher _hasher = Substitute.For<IPasswordHasher>();
    private readonly IDomainEventPublisher _publisher = Substitute.For<IDomainEventPublisher>();
    private readonly IUnitOfWork _unitOfWork = Substitute.For<IUnitOfWork>();

    private RegisterUserCommandHandler CreateHandler() => new(
        _userRepo, _roleRepo, _hasher, _publisher, _unitOfWork);

    [Fact]
    public async Task Handle_NewUser_ShouldHashPasswordAndPersist()
    {
        _userRepo.ExistsByEmailAsync("new@example.com", default).Returns(false);
        _roleRepo.FindByNameAsync("User", default).Returns((Role?)null);
        _hasher.Hash("Password1!").Returns("hashed-password");
        _unitOfWork.SaveChangesAsync(default).Returns(1);

        var result = await CreateHandler().Handle(
            new RegisterUserCommand("new@example.com", "Password1!"),
            default);

        result.Email.Should().Be("new@example.com");
        result.UserId.Should().NotBeEmpty();
        _hasher.Received(1).Hash("Password1!");
        _userRepo.Received(1).Add(Arg.Is<User>(u => u.Email == "new@example.com"));
        await _unitOfWork.Received(1).SaveChangesAsync(default);
    }

    [Fact]
    public async Task Handle_NewUser_ShouldPublishUserRegisteredEvent()
    {
        _userRepo.ExistsByEmailAsync(Arg.Any<string>(), default).Returns(false);
        _roleRepo.FindByNameAsync("User", default).Returns((Role?)null);
        _hasher.Hash(Arg.Any<string>()).Returns("hash");
        _unitOfWork.SaveChangesAsync(default).Returns(1);

        await CreateHandler().Handle(
            new RegisterUserCommand("new@example.com", "Password1!"),
            default);

        await _publisher.Received(1).PublishAsync(
            Arg.Any<UserRegisteredEvent>(), default);
    }

    [Fact]
    public async Task Handle_DuplicateEmail_ShouldThrowUserAlreadyExistsException()
    {
        _userRepo.ExistsByEmailAsync(Arg.Any<string>(), default).Returns(true);

        var act = async () => await CreateHandler().Handle(
            new RegisterUserCommand("existing@example.com", "Password1!"),
            default);

        await act.Should().ThrowAsync<UserAlreadyExistsException>();
        await _unitOfWork.DidNotReceive().SaveChangesAsync(default);
        await _publisher.DidNotReceive().PublishAsync(
            Arg.Any<UserRegisteredEvent>(), default);
    }

    [Fact]
    public async Task Handle_ShouldNormalizeEmail()
    {
        _userRepo.ExistsByEmailAsync(Arg.Any<string>(), default).Returns(false);
        _roleRepo.FindByNameAsync("User", default).Returns((Role?)null);
        _hasher.Hash(Arg.Any<string>()).Returns("hash");
        _unitOfWork.SaveChangesAsync(default).Returns(1);

        var result = await CreateHandler().Handle(
            new RegisterUserCommand("  USER@EXAMPLE.COM  ", "Password1!"),
            default);

        result.Email.Should().Be("user@example.com");
    }

    [Fact]
    public async Task Handle_WithDefaultRole_ShouldAssignUserRole()
    {
        var defaultRole = Role.Create("User");
        _userRepo.ExistsByEmailAsync(Arg.Any<string>(), default).Returns(false);
        _roleRepo.FindByNameAsync("User", default).Returns(defaultRole);
        _hasher.Hash(Arg.Any<string>()).Returns("hash");
        _unitOfWork.SaveChangesAsync(default).Returns(1);

        await CreateHandler().Handle(
            new RegisterUserCommand("new@example.com", "Password1!"),
            default);

        _userRepo.Received(1).Add(
            Arg.Is<User>(u => u.Roles.Any(r => r.RoleId == defaultRole.Id)));
    }
}