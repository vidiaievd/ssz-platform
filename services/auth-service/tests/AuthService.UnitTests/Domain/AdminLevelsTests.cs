using AuthService.Domain.Entities;
using AuthService.Domain.Exceptions;
using FluentAssertions;
using Xunit;

namespace AuthService.UnitTests.Domain;

public sealed class AdminLevelsTests
{
    [Theory]
    [InlineData(AdminLevels.Support, AdminLevels.Support, true)]
    [InlineData(AdminLevels.Support, AdminLevels.Admin, false)]
    [InlineData(AdminLevels.Admin, AdminLevels.Support, true)]
    [InlineData(AdminLevels.Admin, AdminLevels.Super, false)]
    [InlineData(AdminLevels.Super, AdminLevels.Admin, true)]
    [InlineData(AdminLevels.Super, AdminLevels.Super, true)]
    public void AtLeast_FollowsTheNesting(string level, string required, bool expected) =>
        AdminLevels.AtLeast(level, required).Should().Be(expected);

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("SUPER")]
    [InlineData("root")]
    public void AtLeast_UnknownLevel_AdmitsNothing(string? level) =>
        AdminLevels.AtLeast(level, AdminLevels.Support).Should().BeFalse();

    [Fact]
    public void Create_UnknownLevel_IsRefused()
    {
        var act = () => AdminLevelAssignment.Create(Guid.NewGuid(), "root", DateTimeOffset.UtcNow);

        act.Should().Throw<DomainException>().Which.Code.Should().Be("ADMIN_LEVEL_UNKNOWN");
    }

    [Fact]
    public void ChangeTo_RecordsWhoAndWhen()
    {
        var assignment = AdminLevelAssignment.Create(
            Guid.NewGuid(), AdminLevels.Support, DateTimeOffset.UtcNow.AddDays(-1));
        var by = Guid.NewGuid();
        var at = DateTimeOffset.UtcNow;

        assignment.ChangeTo(AdminLevels.Admin, at, by);

        assignment.Level.Should().Be(AdminLevels.Admin);
        assignment.GrantedBy.Should().Be(by);
        assignment.GrantedAt.Should().Be(at);
    }

    [Fact]
    public void AdminClient_IsAKnownClient() =>
        ClientTypes.Normalize("Admin").Should().Be(ClientTypes.Admin);
}
