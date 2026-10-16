using AuthService.Application.Interfaces;
using AuthService.Application.Options;
using AuthService.Application.Services;
using AuthService.Domain.Entities;
using FluentAssertions;
using Microsoft.Extensions.Options;
using NSubstitute;
using Xunit;

namespace AuthService.UnitTests.Application;

// ADR-012: a refresh token lives as long as the shortest lifetime among the user's roles on
// the client the session was opened from.
public sealed class RefreshTokenLifetimeResolverTests
{
    private readonly ITokenLifetimePolicyRepository _policies =
        Substitute.For<ITokenLifetimePolicyRepository>();

    private readonly IOptions<AuthOptions> _opts =
        Options.Create(new AuthOptions { RefreshTokenLifetimeDays = 7 });

    private static readonly DateTimeOffset At = new(2026, 10, 16, 0, 0, 0, TimeSpan.Zero);

    private RefreshTokenLifetimeResolver CreateResolver() => new(_policies, _opts);

    private void Holds(string clientType, params (string Role, int Hours)[] policies) =>
        _policies.ListForAsync(Arg.Any<IReadOnlyCollection<string>>(), clientType, Arg.Any<CancellationToken>())
            .Returns(policies.Select(p => TokenLifetimePolicy.Create(p.Role, clientType, p.Hours, At)).ToList());

    [Fact]
    public async Task A_student_on_a_phone_gets_the_mobile_lifetime()
    {
        Holds(ClientTypes.Mobile, (RoleNames.Student, 720));

        var lifetime = await CreateResolver().ResolveAsync([RoleNames.Student], ClientTypes.Mobile);

        lifetime.Should().Be(TimeSpan.FromDays(30));
    }

    [Fact]
    public async Task Several_roles_take_the_shortest()
    {
        Holds(ClientTypes.Mobile, (RoleNames.Student, 720), (RoleNames.Teacher, 336));

        var lifetime = await CreateResolver().ResolveAsync(
            [RoleNames.Student, RoleNames.Teacher], ClientTypes.Mobile);

        lifetime.Should().Be(TimeSpan.FromDays(14));
    }

    [Fact]
    public async Task Roles_without_a_policy_fall_back_to_the_configured_lifetime()
    {
        Holds(ClientTypes.Web);

        var lifetime = await CreateResolver().ResolveAsync(["some_new_role"], ClientTypes.Web);

        lifetime.Should().Be(TimeSpan.FromDays(7));
    }

    [Fact]
    public async Task An_unknown_client_is_read_as_web()
    {
        Holds(ClientTypes.Web, (RoleNames.PlatformAdmin, 12));

        var lifetime = await CreateResolver().ResolveAsync([RoleNames.PlatformAdmin], "smart-fridge");

        lifetime.Should().Be(TimeSpan.FromHours(12));
    }
}
