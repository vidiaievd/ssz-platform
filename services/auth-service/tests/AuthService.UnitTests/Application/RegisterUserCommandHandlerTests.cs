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
        var studentRole = Role.Create("Student");
        _userRepo.ExistsByEmailAsync("new@example.com", default).Returns(false);
        _roleRepo.FindByNameAsync("Student", default).Returns(studentRole);
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
        var studentRole = Role.Create("Student");
        _userRepo.ExistsByEmailAsync(Arg.Any<string>(), default).Returns(false);
        _roleRepo.FindByNameAsync("Student", default).Returns(studentRole);
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
        var studentRole = Role.Create("Student");
        _userRepo.ExistsByEmailAsync(Arg.Any<string>(), default).Returns(false);
        _roleRepo.FindByNameAsync("Student", default).Returns(studentRole);
        _hasher.Hash(Arg.Any<string>()).Returns("hash");
        _unitOfWork.SaveChangesAsync(default).Returns(1);

        var result = await CreateHandler().Handle(
            new RegisterUserCommand("  USER@EXAMPLE.COM  ", "Password1!"),
            default);

        result.Email.Should().Be("user@example.com");
    }

    [Fact]
    public async Task Handle_StudentRegistration_ShouldAssignOnlyStudentRole()
    {
        var studentRole = Role.Create("Student");
        _userRepo.ExistsByEmailAsync(Arg.Any<string>(), default).Returns(false);
        _roleRepo.FindByNameAsync("Student", default).Returns(studentRole);
        _hasher.Hash(Arg.Any<string>()).Returns("hash");
        _unitOfWork.SaveChangesAsync(default).Returns(1);

        await CreateHandler().Handle(
            new RegisterUserCommand("student@example.com", "Password1!", "student"),
            default);

        _userRepo.Received(1).Add(
            Arg.Is<User>(u => u.Roles.Any(r => r.RoleId == studentRole.Id)));

        // Tutor role never looked up for student registration
        await _roleRepo.DidNotReceive().FindByNameAsync("Tutor", default);
    }

    [Fact]
    public async Task Handle_StudentRegistration_ShouldEmitOnlyStudentRoleInEvent()
    {
        var studentRole = Role.Create("Student");
        _userRepo.ExistsByEmailAsync(Arg.Any<string>(), default).Returns(false);
        _roleRepo.FindByNameAsync("Student", default).Returns(studentRole);
        _hasher.Hash(Arg.Any<string>()).Returns("hash");
        _unitOfWork.SaveChangesAsync(default).Returns(1);

        await CreateHandler().Handle(
            new RegisterUserCommand("student@example.com", "Password1!", "student"),
            default);

        await _publisher.Received(1).PublishAsync(
            Arg.Is<UserRegisteredEvent>(e =>
                e.Roles.Contains("student") && !e.Roles.Contains("tutor")),
            default);
    }

    [Fact]
    public async Task Handle_TutorRegistration_ShouldAssignBothStudentAndTutorRoles()
    {
        var studentRole = Role.Create("Student");
        var tutorRole = Role.Create("Tutor");
        _userRepo.ExistsByEmailAsync(Arg.Any<string>(), default).Returns(false);
        _roleRepo.FindByNameAsync("Student", default).Returns(studentRole);
        _roleRepo.FindByNameAsync("Tutor", default).Returns(tutorRole);
        _hasher.Hash(Arg.Any<string>()).Returns("hash");
        _unitOfWork.SaveChangesAsync(default).Returns(1);

        await CreateHandler().Handle(
            new RegisterUserCommand("tutor@example.com", "Password1!", "tutor"),
            default);

        // Both Student and Tutor must be assigned (ROLES.md: Student is always present)
        _userRepo.Received(1).Add(Arg.Is<User>(u =>
            u.Roles.Any(r => r.RoleId == studentRole.Id) &&
            u.Roles.Any(r => r.RoleId == tutorRole.Id)));
    }

    [Fact]
    public async Task Handle_TutorRegistration_ShouldEmitStudentAndTutorRolesInEvent()
    {
        var studentRole = Role.Create("Student");
        var tutorRole = Role.Create("Tutor");
        _userRepo.ExistsByEmailAsync(Arg.Any<string>(), default).Returns(false);
        _roleRepo.FindByNameAsync("Student", default).Returns(studentRole);
        _roleRepo.FindByNameAsync("Tutor", default).Returns(tutorRole);
        _hasher.Hash(Arg.Any<string>()).Returns("hash");
        _unitOfWork.SaveChangesAsync(default).Returns(1);

        await CreateHandler().Handle(
            new RegisterUserCommand("tutor@example.com", "Password1!", "tutor"),
            default);

        await _publisher.Received(1).PublishAsync(
            Arg.Is<UserRegisteredEvent>(e =>
                e.Roles.Contains("student") && e.Roles.Contains("tutor")),
            default);
    }

    [Fact]
    public async Task Handle_MissingStudentRole_ShouldThrowDomainException()
    {
        _userRepo.ExistsByEmailAsync(Arg.Any<string>(), default).Returns(false);
        _roleRepo.FindByNameAsync("Student", default).Returns((Role?)null);
        _hasher.Hash(Arg.Any<string>()).Returns("hash");

        var act = async () => await CreateHandler().Handle(
            new RegisterUserCommand("new@example.com", "Password1!", "student"),
            default);

        await act.Should().ThrowAsync<DomainException>()
            .WithMessage("*Student*");
    }

    [Fact]
    public async Task Handle_TutorRegistration_MissingTutorRole_ShouldThrowDomainException()
    {
        // Student must be found first; Tutor is null → should throw for Tutor
        var studentRole = Role.Create("Student");
        _userRepo.ExistsByEmailAsync(Arg.Any<string>(), default).Returns(false);
        _roleRepo.FindByNameAsync("Student", default).Returns(studentRole);
        _roleRepo.FindByNameAsync("Tutor", default).Returns((Role?)null);
        _hasher.Hash(Arg.Any<string>()).Returns("hash");

        var act = async () => await CreateHandler().Handle(
            new RegisterUserCommand("tutor@example.com", "Password1!", "tutor"),
            default);

        await act.Should().ThrowAsync<DomainException>()
            .WithMessage("*Tutor*");
    }
}
