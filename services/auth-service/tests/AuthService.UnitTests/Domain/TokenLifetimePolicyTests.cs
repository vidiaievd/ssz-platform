using AuthService.Domain.Entities;
using AuthService.Domain.Exceptions;
using FluentAssertions;
using Xunit;

namespace AuthService.UnitTests.Domain;

public sealed class TokenLifetimePolicyTests
{
    private static readonly DateTimeOffset At = new(2026, 10, 16, 0, 0, 0, TimeSpan.Zero);

    [Theory]
    [InlineData(0)]
    [InlineData(TokenLifetimePolicy.MaxHours + 1)]
    public void A_lifetime_out_of_bounds_is_refused(int hours)
    {
        var policy = TokenLifetimePolicy.Create(RoleNames.Student, ClientTypes.Web, 168, At);

        var act = () => policy.Change(hours, Guid.NewGuid(), At);

        act.Should().Throw<DomainException>().Which.Code.Should().Be("TOKEN_LIFETIME_OUT_OF_BOUNDS");
    }

    [Fact]
    public void A_change_records_who_made_it()
    {
        var policy = TokenLifetimePolicy.Create(RoleNames.Student, ClientTypes.Mobile, 720, At);
        var admin = Guid.NewGuid();

        policy.Change(240, admin, At.AddDays(1));

        policy.RefreshLifetimeHours.Should().Be(240);
        policy.UpdatedBy.Should().Be(admin);
        policy.UpdatedAt.Should().Be(At.AddDays(1));
    }

    [Fact]
    public void An_unknown_client_is_refused()
    {
        var act = () => TokenLifetimePolicy.Create(RoleNames.Student, "tablet", 168, At);

        act.Should().Throw<DomainException>().Which.Code.Should().Be("TOKEN_LIFETIME_UNKNOWN_CLIENT");
    }

    [Fact]
    public void Administrators_have_the_shortest_defaults_and_students_on_a_phone_the_longest()
    {
        var byRole = DefaultTokenLifetimes.All;
        var admin = byRole.Where(d => d.Role == RoleNames.PlatformAdmin).Max(d => d.Hours);
        var others = byRole.Where(d => d.Role != RoleNames.PlatformAdmin).Min(d => d.Hours);

        admin.Should().BeLessThan(others);
        byRole.Max(d => d.Hours).Should().Be(30 * 24);
        byRole.Select(d => $"{d.Role}/{d.ClientType}").Should().OnlyHaveUniqueItems();
    }
}
