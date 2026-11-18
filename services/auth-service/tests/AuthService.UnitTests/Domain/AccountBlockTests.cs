using AuthService.Domain.Entities;
using AuthService.Domain.Exceptions;
using FluentAssertions;
using Xunit;

namespace AuthService.UnitTests.Domain;

/// <summary>
/// Plan 90, phase 6: a block set by an administrator, apart from the lockout after failed
/// sign-ins — it never expires and a correct password does not lift it.
/// </summary>
public sealed class AccountBlockTests
{
    private static readonly Guid Actor = Guid.NewGuid();
    private static readonly DateTimeOffset Now = new(2026, 11, 15, 12, 0, 0, TimeSpan.Zero);

    private static User CreateUser()
    {
        var user = User.Create("student@example.com", "hash", [RoleNames.Student]);
        user.AddRefreshToken("h1", "family-1", DateTimeOffset.UtcNow.AddDays(7));
        user.AddRefreshToken("h2", "family-2", DateTimeOffset.UtcNow.AddDays(7), clientType: ClientTypes.Mobile);
        user.ClearDomainEvents();
        return user;
    }

    [Fact]
    public void Block_RecordsWhoWhenAndWhy_AndEndsEverySession()
    {
        var user = CreateUser();

        user.Block(Actor, "  spam in groups  ", Now).Should().BeTrue();

        user.IsBlocked.Should().BeTrue();
        user.BlockedAt.Should().Be(Now);
        user.BlockedBy.Should().Be(Actor);
        user.BlockReason.Should().Be("spam in groups");
        user.RefreshTokens.Should().OnlyContain(t => t.IsRevoked);
    }

    [Fact]
    public void Block_AlreadyBlocked_KeepsTheFirstBlock()
    {
        var user = CreateUser();
        user.Block(Actor, "first", Now);

        user.Block(Guid.NewGuid(), "second", Now.AddDays(1)).Should().BeFalse();

        user.BlockedBy.Should().Be(Actor);
        user.BlockReason.Should().Be("first");
        user.BlockedAt.Should().Be(Now);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Block_WithoutAReason_IsRefused(string reason)
    {
        var user = CreateUser();

        var act = () => user.Block(Actor, reason, Now);

        act.Should().Throw<DomainException>().Which.Code.Should().Be("REASON_REQUIRED");
        user.IsBlocked.Should().BeFalse();
    }

    [Fact]
    public void Unblock_ClearsTheBlock()
    {
        var user = CreateUser();
        user.Block(Actor, "reason", Now);

        user.Unblock().Should().BeTrue();

        user.IsBlocked.Should().BeFalse();
        user.BlockedAt.Should().BeNull();
        user.BlockedBy.Should().BeNull();
        user.BlockReason.Should().BeNull();
    }

    [Fact]
    public void Unblock_NotBlocked_ChangesNothing()
    {
        CreateUser().Unblock().Should().BeFalse();
    }

    [Fact]
    public void SuccessfulLogin_LeavesTheBlockAlone()
    {
        // RecordSuccessfulLogin clears the lockout after failed sign-ins; it must not clear this.
        var user = CreateUser();
        user.Block(Actor, "reason", Now);

        user.RecordSuccessfulLogin();

        user.IsBlocked.Should().BeTrue();
    }

    [Fact]
    public void EnsureNotBlocked_ThrowsOnlyWhenBlocked()
    {
        var user = CreateUser();
        user.Invoking(u => u.EnsureNotBlocked()).Should().NotThrow();

        user.Block(Actor, "reason", Now);

        user.Invoking(u => u.EnsureNotBlocked()).Should().Throw<AccountBlockedException>()
            .Which.Code.Should().Be("ACCOUNT_BLOCKED");
    }
}
