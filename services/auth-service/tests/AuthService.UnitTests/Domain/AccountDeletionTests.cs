using AuthService.Domain.Entities;
using AuthService.Domain.Events;
using AuthService.Domain.Exceptions;
using FluentAssertions;
using Xunit;

namespace AuthService.UnitTests.Domain;

public sealed class AccountDeletionTests
{
    private static User CreateUserWithSession()
    {
        var user = User.Create("test@example.com", "hash", [RoleNames.Student]);
        user.AddRefreshToken("hash-1", "family-1", DateTimeOffset.UtcNow.AddDays(30));
        user.AddRefreshToken("hash-2", "family-2", DateTimeOffset.UtcNow.AddDays(30));
        user.ClearDomainEvents();
        return user;
    }

    [Fact]
    public void RequestDeletion_StudentOnly_RecordsTheRequestAndEndsEverySession()
    {
        var user = CreateUserWithSession();

        user.RequestDeletion([RoleNames.Student]);

        user.DeletionRequestedAt.Should().BeCloseTo(DateTimeOffset.UtcNow, TimeSpan.FromSeconds(5));
        user.RefreshTokens.Should().OnlyContain(t => t.IsRevoked);
    }

    [Fact]
    public void RequestDeletion_TellsNobodyButTheLogout()
    {
        // Nobody else hears anything during the grace period.
        var user = CreateUserWithSession();

        user.RequestDeletion([RoleNames.Student]);

        user.DomainEvents.Should().ContainSingle().Which.Should().BeOfType<UserLoggedOutEvent>();
    }

    [Theory]
    [InlineData(RoleNames.Tutor)]
    [InlineData(RoleNames.Teacher)]
    [InlineData(RoleNames.SchoolAdmin)]
    [InlineData(RoleNames.PlatformAdmin)]
    public void RequestDeletion_AnyOtherRole_GoesThroughSupport(string otherRole)
    {
        var user = CreateUserWithSession();

        var act = () => user.RequestDeletion([RoleNames.Student, otherRole]);

        act.Should().Throw<SelfDeletionNotAllowedException>()
            .Which.Code.Should().Be("CONTACT_SUPPORT");
        user.DeletionRequestedAt.Should().BeNull();
        user.RefreshTokens.Should().OnlyContain(t => !t.IsRevoked);
    }

    [Fact]
    public void RequestDeletion_NoRoles_GoesThroughSupport()
    {
        var act = () => CreateUserWithSession().RequestDeletion([]);

        act.Should().Throw<SelfDeletionNotAllowedException>();
    }

    [Fact]
    public void RequestDeletion_Again_KeepsTheFirstDate()
    {
        var user = CreateUserWithSession();
        user.RequestDeletion([RoleNames.Student]);
        var first = user.DeletionRequestedAt;

        user.RequestDeletion([RoleNames.Student]);

        user.DeletionRequestedAt.Should().Be(first);
    }

    [Fact]
    public void RecordSuccessfulLogin_WhileDeletionPending_CancelsIt()
    {
        var user = CreateUserWithSession();
        user.RequestDeletion([RoleNames.Student]);

        var cancelled = user.RecordSuccessfulLogin();

        cancelled.Should().BeTrue();
        user.DeletionRequestedAt.Should().BeNull();
    }

    [Fact]
    public void RecordSuccessfulLogin_NothingPending_CancelsNothing()
    {
        CreateUserWithSession().RecordSuccessfulLogin().Should().BeFalse();
    }

    [Fact]
    public void MarkPurged_RaisesUserDeleted()
    {
        var user = CreateUserWithSession();

        user.MarkPurged();

        var deleted = user.DomainEvents.Should().ContainSingle()
            .Which.Should().BeOfType<UserDeletedEvent>().Subject;
        deleted.UserId.Should().Be(user.Id);
        deleted.Email.Should().Be(user.Email);
    }
}
