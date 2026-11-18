using AuthService.Application.Commands;
using AuthService.Application.Interfaces;
using AuthService.Application.Options;
using AuthService.Application.Services;
using AuthService.Domain.Entities;
using AuthService.Domain.Exceptions;
using FluentAssertions;
using Microsoft.Extensions.Options;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Xunit;

namespace AuthService.UnitTests.Application;

/// <summary>Plan 90, phase 6, step 2: the admin user list and card.</summary>
public sealed class AdminUserQueryTests
{
    private readonly IAdminUserReader _reader = Substitute.For<IAdminUserReader>();
    private readonly IRoleRepository _roles = Substitute.For<IRoleRepository>();
    private readonly IRateLimitStore _store = Substitute.For<IRateLimitStore>();
    private readonly IOptions<AuthOptions> _options = Options.Create(new AuthOptions { AccountDeletionGraceDays = 30 });

    public AdminUserQueryTests()
    {
        _reader.ListAsync(Arg.Any<AdminUserCriteria>(), Arg.Any<DateTimeOffset>(), Arg.Any<CancellationToken>())
            .Returns(new AdminUserPage([], 0));
    }

    private ListAdminUsersQueryHandler ListHandler() => new(_reader, _roles, _options);
    private GetAdminUserQueryHandler GetHandler() => new(_reader, _store, _options);

    private static AdminUserRow Row(
        bool isLocked = false,
        DateTimeOffset? lockedUntil = null,
        DateTimeOffset? deletionRequestedAt = null,
        DateTimeOffset? blockedAt = null) =>
        new(Guid.NewGuid(), "anna@example.com", [RoleNames.Student], null, true, false,
            blockedAt, isLocked, lockedUntil, deletionRequestedAt,
            DateTimeOffset.UtcNow.AddDays(-10), null);

    private AdminUserCriteria? CapturedCriteria()
    {
        var call = _reader.ReceivedCalls().SingleOrDefault(c => c.GetMethodInfo().Name == nameof(IAdminUserReader.ListAsync));
        return call?.GetArguments()[0] as AdminUserCriteria;
    }

    // ── List: arguments ──────────────────────────────────────────────────────

    [Fact]
    public async Task List_Defaults_Page1_Limit25_NewestFirst()
    {
        var result = await ListHandler().Handle(new ListAdminUsersQuery(), default);

        result.Page.Should().Be(1);
        result.Limit.Should().Be(25);
        CapturedCriteria().Should().BeEquivalentTo(
            new AdminUserCriteria(null, null, null, null, AdminUserSorts.CreatedDesc, 1, 25));
    }

    [Fact]
    public async Task List_PassesTheParsedFilter()
    {
        var role = Role.Create(RoleNames.Tutor);
        _roles.FindByNameAsync(RoleNames.Tutor, Arg.Any<CancellationToken>()).Returns(role);
        var a = Guid.NewGuid();
        var b = Guid.NewGuid();

        await ListHandler().Handle(new ListAdminUsersQuery(
            Search: "  anna@Sch ", Role: RoleNames.Tutor, Status: AdminUserStatuses.Blocked,
            Sort: AdminUserSorts.EmailAsc, Page: 3, Limit: 100, Ids: $"{a}, {b},{a}"), default);

        CapturedCriteria().Should().BeEquivalentTo(new AdminUserCriteria(
            "ANNA@SCH", role.Id, AdminUserStatuses.Blocked, [a, b], AdminUserSorts.EmailAsc, 3, 100));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(101)]
    public async Task List_LimitOutOfRange_Is400(int limit)
    {
        var act = () => ListHandler().Handle(new ListAdminUsersQuery(Limit: limit), default);
        (await act.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("INVALID_FILTER");
    }

    [Fact]
    public async Task List_PageBelowOne_Is400()
    {
        var act = () => ListHandler().Handle(new ListAdminUsersQuery(Page: 0), default);
        (await act.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("INVALID_FILTER");
    }

    [Fact]
    public async Task List_SearchOfOneCharacter_Is400_ButBlankMeansNoSearch()
    {
        var act = () => ListHandler().Handle(new ListAdminUsersQuery(Search: " a "), default);
        (await act.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("INVALID_FILTER");

        await ListHandler().Handle(new ListAdminUsersQuery(Search: "   "), default);
        CapturedCriteria()!.Search.Should().BeNull();
    }

    [Theory]
    [InlineData("frozen", null, null)]
    [InlineData(null, "name", null)]
    [InlineData(null, null, "superuser")]
    public async Task List_UnknownStatusSortOrRole_Is400(string? status, string? sort, string? role)
    {
        var act = () => ListHandler().Handle(new ListAdminUsersQuery(Status: status, Sort: sort, Role: role), default);
        (await act.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("INVALID_FILTER");
    }

    [Fact]
    public async Task List_IdsNotUuid_Is400()
    {
        var act = () => ListHandler().Handle(new ListAdminUsersQuery(Ids: $"{Guid.NewGuid()},nope"), default);
        (await act.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("INVALID_FILTER");
    }

    [Fact]
    public async Task List_MoreThan100Ids_Is400()
    {
        var ids = string.Join(',', Enumerable.Range(0, 101).Select(_ => Guid.NewGuid()));
        var act = () => ListHandler().Handle(new ListAdminUsersQuery(Ids: ids), default);
        (await act.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("INVALID_FILTER");
    }

    [Fact]
    public async Task List_KnownRoleMissingFromTheTable_IsEmpty_WithoutReading()
    {
        var result = await ListHandler().Handle(new ListAdminUsersQuery(Role: RoleNames.Premium), default);

        result.Items.Should().BeEmpty();
        result.Total.Should().Be(0);
        CapturedCriteria().Should().BeNull();
    }

    // ── List: rows ───────────────────────────────────────────────────────────

    [Fact]
    public async Task List_Row_ShowsARunningLockout_AndThePurgeDate()
    {
        var requested = DateTimeOffset.UtcNow.AddDays(-5);
        var until = DateTimeOffset.UtcNow.AddMinutes(10);
        var locked = Row(isLocked: true, lockedUntil: until, deletionRequestedAt: requested);
        var expired = Row(isLocked: true, lockedUntil: DateTimeOffset.UtcNow.AddMinutes(-1));
        _reader.ListAsync(Arg.Any<AdminUserCriteria>(), Arg.Any<DateTimeOffset>(), Arg.Any<CancellationToken>())
            .Returns(new AdminUserPage([locked, expired], 42));

        var result = await ListHandler().Handle(new ListAdminUsersQuery(), default);

        result.Total.Should().Be(42);
        result.Items[0].LockedUntil.Should().Be(until);
        result.Items[0].PurgeAt.Should().Be(requested.AddDays(30));
        result.Items[1].LockedUntil.Should().BeNull();
        result.Items[1].PurgeAt.Should().BeNull();
    }

    // ── Card ─────────────────────────────────────────────────────────────────

    private AdminUserRecord GivenRecord(
        AdminUserRow? row = null,
        IReadOnlyList<AdminSessionToken>? tokens = null,
        IReadOnlyDictionary<string, DateTimeOffset>? lastIssued = null)
    {
        row ??= Row();
        var record = new AdminUserRecord(row, null, null, 2, DateTimeOffset.UtcNow.AddHours(-1), 6,
            tokens ?? [], lastIssued ?? new Dictionary<string, DateTimeOffset>());
        _reader.GetAsync(row.Id, Arg.Any<DateTimeOffset>(), Arg.Any<CancellationToken>()).Returns(record);
        _store.InspectAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(new RateLimitSnapshot(0, null));
        return record;
    }

    [Fact]
    public async Task Get_Unknown_Is404()
    {
        var act = () => GetHandler().Handle(new GetAdminUserQuery(Guid.NewGuid()), default);
        await act.Should().ThrowAsync<UserNotFoundException>();
    }

    [Fact]
    public async Task Get_Blocked_ShowsWhoAndWhy()
    {
        var blockedAt = DateTimeOffset.UtcNow.AddDays(-1);
        var actor = Guid.NewGuid();
        var row = Row(blockedAt: blockedAt);
        _reader.GetAsync(row.Id, Arg.Any<DateTimeOffset>(), Arg.Any<CancellationToken>())
            .Returns(new AdminUserRecord(row, actor, "spam", 0, null, 0, [], new Dictionary<string, DateTimeOffset>()));
        _store.InspectAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(new RateLimitSnapshot(0, null));

        var card = await GetHandler().Handle(new GetAdminUserQuery(row.Id), default);

        card.Block.Should().BeEquivalentTo(new { At = blockedAt, By = actor, Reason = "spam" });
    }

    [Fact]
    public async Task Get_NotBlocked_HasNoBlock_AndCountsFailedLogins()
    {
        var record = GivenRecord();

        var card = await GetHandler().Handle(new GetAdminUserQuery(record.Row.Id), default);

        card.Block.Should().BeNull();
        card.FailedLogins.Count.Should().Be(2);
        card.FailedLogins.LastAt.Should().Be(record.LastFailedLoginAt);
        card.BackupCodesLeft.Should().Be(6);
    }

    [Fact]
    public async Task Get_MfaCodes_ReadsTheAccountsKey_AndTurnsTheTtlIntoATime()
    {
        var record = GivenRecord();
        _store.InspectAsync($"mfa:attempts:{record.Row.Id}", Arg.Any<CancellationToken>())
            .Returns(new RateLimitSnapshot(5, TimeSpan.FromMinutes(12)));

        var before = DateTimeOffset.UtcNow;
        var card = await GetHandler().Handle(new GetAdminUserQuery(record.Row.Id), default);

        card.MfaCodes.Available.Should().BeTrue();
        card.MfaCodes.Failures.Should().Be(5);
        card.MfaCodes.LockedUntil.Should().BeCloseTo(before.AddMinutes(12), TimeSpan.FromSeconds(5));
    }

    [Fact]
    public async Task Get_RedisDown_StillAnswers_WithMfaCodesUnavailable()
    {
        var record = GivenRecord();
        _store.InspectAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .ThrowsAsync(new InvalidOperationException("redis down"));

        var card = await GetHandler().Handle(new GetAdminUserQuery(record.Row.Id), default);

        card.MfaCodes.Available.Should().BeFalse();
        card.MfaCodes.LockedUntil.Should().BeNull();
    }

    [Fact]
    public async Task Get_Sessions_OnePerClient_InFixedOrder_ThreeNewestShown()
    {
        var now = DateTimeOffset.UtcNow;
        var tokens = Enumerable.Range(1, 4)
            .Select(i => new AdminSessionToken(ClientTypes.Web, now.AddHours(-i), now.AddDays(7), $"web-{i}"))
            .Append(new AdminSessionToken(ClientTypes.Admin, now.AddMinutes(-5), now.AddHours(12), "panel"))
            .ToList();
        var lastIssued = new Dictionary<string, DateTimeOffset>
        {
            [ClientTypes.Web] = now.AddHours(-1),
            [ClientTypes.Mobile] = now.AddDays(-20),
            [ClientTypes.Admin] = now.AddMinutes(-5),
        };
        var record = GivenRecord(tokens: tokens, lastIssued: lastIssued);

        var card = await GetHandler().Handle(new GetAdminUserQuery(record.Row.Id), default);

        card.Sessions.Select(s => s.ClientType).Should().Equal(ClientTypes.Web, ClientTypes.Mobile, ClientTypes.Admin);

        var web = card.Sessions[0];
        web.Active.Should().Be(4);
        web.Recent.Select(r => r.DeviceInfo).Should().Equal("web-1", "web-2", "web-3");

        // Signed in on the phone once, long ago: nothing open, the date stays.
        var mobile = card.Sessions[1];
        mobile.Active.Should().Be(0);
        mobile.Recent.Should().BeEmpty();
        mobile.LastIssuedAt.Should().Be(now.AddDays(-20));

        card.Sessions[2].Active.Should().Be(1);
    }

    [Fact]
    public async Task Get_NeverSignedIn_HasThreeEmptyClients()
    {
        var record = GivenRecord();

        var card = await GetHandler().Handle(new GetAdminUserQuery(record.Row.Id), default);

        card.Sessions.Should().HaveCount(3).And.OnlyContain(s => s.Active == 0 && s.LastIssuedAt == null);
    }
}
