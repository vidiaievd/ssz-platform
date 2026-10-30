using AuthService.Application.Commands;
using AuthService.Application.Interfaces;
using AuthService.Application.Options;
using AuthService.Domain.Common;
using AuthService.Domain.Entities;
using AuthService.Domain.Events;
using AuthService.Domain.Exceptions;
using FluentAssertions;
using Microsoft.Extensions.Options;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Xunit;

namespace AuthService.UnitTests.Application;

public sealed class AccountDeletionCommandHandlerTests
{
    private readonly IUserRepository _userRepo = Substitute.For<IUserRepository>();
    private readonly IRoleRepository _roleRepo = Substitute.For<IRoleRepository>();
    private readonly IPasswordHasher _hasher = Substitute.For<IPasswordHasher>();
    private readonly IDomainEventPublisher _publisher = Substitute.For<IDomainEventPublisher>();
    private readonly IUnitOfWork _unitOfWork = Substitute.For<IUnitOfWork>();

    private static IOptions<AuthOptions> Options(int graceDays = 30) =>
        Microsoft.Extensions.Options.Options.Create(new AuthOptions
        {
            MaxFailedLoginAttempts = 5,
            LockoutDurationMinutes = 15,
            AccountDeletionGraceDays = graceDays,
        });

    private RequestAccountDeletionCommandHandler CreateRequestHandler() => new(
        _userRepo, _roleRepo, _hasher, _publisher, _unitOfWork, Options());

    private PurgeAccountCommandHandler CreatePurgeHandler(int graceDays) => new(
        _userRepo, _publisher, _unitOfWork, Options(graceDays));

    private User CreateStudent()
    {
        var user = User.Create("test@example.com", "hash", [RoleNames.Student]);
        user.ClearDomainEvents();
        _userRepo.FindByIdWithTokensAsync(user.Id, Arg.Any<CancellationToken>()).Returns(user);
        _userRepo.FindByIdWithBackupCodesAsync(user.Id, Arg.Any<CancellationToken>()).Returns(user);
        _roleRepo.GetRoleNamesForUserAsync(user.Id, Arg.Any<CancellationToken>())
            .Returns([RoleNames.Student]);
        return user;
    }

    // ── Request ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task Request_RightPassword_SchedulesThePurgeAfterTheGracePeriod()
    {
        var user = CreateStudent();
        _hasher.Verify("Password1!", "hash").Returns(true);

        var result = await CreateRequestHandler().Handle(
            new RequestAccountDeletionCommand(user.Id, "Password1!"), default);

        result.DeletionRequestedAt.Should().Be(user.DeletionRequestedAt!.Value);
        result.PurgeAfter.Should().Be(result.DeletionRequestedAt.AddDays(30));
        await _unitOfWork.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
        await _publisher.DidNotReceive().PublishAsync(
            Arg.Is<IDomainEvent>(e => e is UserDeletedEvent), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Request_WrongPassword_CountsTowardsTheLockoutAndSchedulesNothing()
    {
        var user = CreateStudent();
        _hasher.Verify(Arg.Any<string>(), Arg.Any<string>()).Returns(false);

        var act = async () => await CreateRequestHandler().Handle(
            new RequestAccountDeletionCommand(user.Id, "wrong"), default);

        await act.Should().ThrowAsync<PasswordMismatchException>();
        user.FailedLoginAttempts.Should().Be(1);
        user.DeletionRequestedAt.Should().BeNull();
    }

    [Fact]
    public async Task Request_LockedAccount_IsRefusedBeforeThePasswordIsChecked()
    {
        var user = CreateStudent();
        user.RecordFailedLogin(1, TimeSpan.FromMinutes(15));

        var act = async () => await CreateRequestHandler().Handle(
            new RequestAccountDeletionCommand(user.Id, "Password1!"), default);

        await act.Should().ThrowAsync<AccountLockedException>();
        _hasher.DidNotReceive().Verify(Arg.Any<string>(), Arg.Any<string>());
    }

    [Fact]
    public async Task Request_TutorToo_GoesThroughSupport()
    {
        var user = CreateStudent();
        _hasher.Verify("Password1!", "hash").Returns(true);
        _roleRepo.GetRoleNamesForUserAsync(user.Id, Arg.Any<CancellationToken>())
            .Returns([RoleNames.Student, RoleNames.Tutor]);

        var act = async () => await CreateRequestHandler().Handle(
            new RequestAccountDeletionCommand(user.Id, "Password1!"), default);

        await act.Should().ThrowAsync<SelfDeletionNotAllowedException>();
    }

    // ── Purge ─────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Purge_GraceOver_PublishesUserDeletedBeforeErasing()
    {
        var user = CreateStudent();
        user.RequestDeletion([RoleNames.Student]);
        user.ClearDomainEvents();
        var order = new List<string>();
        _publisher.PublishAsync(Arg.Any<IDomainEvent>(), Arg.Any<CancellationToken>())
            .Returns(Task.CompletedTask)
            .AndDoes(c => order.Add(c.Arg<IDomainEvent>().GetType().Name));
        _userRepo.When(r => r.Remove(user)).Do(_ => order.Add("Remove"));
        _unitOfWork.SaveChangesAsync(Arg.Any<CancellationToken>())
            .Returns(1)
            .AndDoes(_ => order.Add("Save"));

        var purged = await CreatePurgeHandler(graceDays: 0).Handle(
            new PurgeAccountCommand(user.Id), default);

        purged.Should().BeTrue();
        order.Should().Equal(nameof(UserDeletedEvent), "Remove", "Save");
    }

    [Fact]
    public async Task Purge_PublishFails_LeavesTheAccountForTheNextRun()
    {
        var user = CreateStudent();
        user.RequestDeletion([RoleNames.Student]);
        user.ClearDomainEvents();
        _publisher.PublishAsync(Arg.Any<IDomainEvent>(), Arg.Any<CancellationToken>())
            .ThrowsAsync(new InvalidOperationException("broker down"));

        var act = async () => await CreatePurgeHandler(graceDays: 0).Handle(
            new PurgeAccountCommand(user.Id), default);

        await act.Should().ThrowAsync<InvalidOperationException>();
        _userRepo.DidNotReceive().Remove(Arg.Any<User>());
        await _unitOfWork.DidNotReceive().SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Purge_StillWithinGrace_ErasesNothing()
    {
        var user = CreateStudent();
        user.RequestDeletion([RoleNames.Student]);

        var purged = await CreatePurgeHandler(graceDays: 30).Handle(
            new PurgeAccountCommand(user.Id), default);

        purged.Should().BeFalse();
        _userRepo.DidNotReceive().Remove(Arg.Any<User>());
    }

    [Fact]
    public async Task Purge_SignedInSinceTheListWasRead_ErasesNothing()
    {
        var user = CreateStudent();
        user.RequestDeletion([RoleNames.Student]);
        user.RecordSuccessfulLogin();

        var purged = await CreatePurgeHandler(graceDays: 0).Handle(
            new PurgeAccountCommand(user.Id), default);

        purged.Should().BeFalse();
        await _publisher.DidNotReceive().PublishAsync(
            Arg.Any<IDomainEvent>(), Arg.Any<CancellationToken>());
    }
}
