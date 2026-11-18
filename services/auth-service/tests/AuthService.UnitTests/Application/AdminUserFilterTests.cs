using System.Reflection;
using AuthService.Application.Interfaces;
using AuthService.Application.Services;
using AuthService.Domain.Common;
using AuthService.Domain.Entities;
using FluentAssertions;
using Xunit;

namespace AuthService.UnitTests.Application;

/// <summary>
/// Plan 90, phase 6, step 2: the filter and order of the admin user list. The same expressions
/// go to PostgreSQL through EF; here they run over a list.
/// </summary>
public sealed class AdminUserFilterTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.UtcNow;
    private readonly Role _student = Role.Create(RoleNames.Student);
    private readonly Role _tutor = Role.Create(RoleNames.Tutor);

    private User NewUser(string email, Role? role = null, DateTimeOffset? createdAt = null)
    {
        var user = User.Create(email, "hash", [RoleNames.Student]);
        user.AssignRole(role ?? _student);
        user.VerifyEmail();
        if (createdAt is { } at) SetCreatedAt(user, at);
        return user;
    }

    private static void SetCreatedAt(User user, DateTimeOffset at) =>
        typeof(Entity).GetProperty(nameof(Entity.CreatedAt))!.SetValue(user, at);

    private static void SetLastLogin(User user, DateTimeOffset? at) =>
        typeof(User).GetProperty(nameof(User.LastLoginAt), BindingFlags.Public | BindingFlags.Instance)!
            .SetValue(user, at);

    private static AdminUserCriteria Criteria(
        string? search = null,
        Guid? roleId = null,
        string? status = null,
        IReadOnlyList<Guid>? ids = null,
        string sort = AdminUserSorts.Default) =>
        new(search, roleId, status, ids, sort, 1, 25);

    private static List<User> Run(IEnumerable<User> users, AdminUserCriteria criteria) =>
        AdminUserFilter.Sort(AdminUserFilter.Apply(users.AsQueryable(), criteria, Now), criteria.Sort).ToList();

    // ── Statuses ──────────────────────────────────────────────────────────────

    private (User active, User blocked, User locked, User expiredLock, User deleting, User unverified) Population()
    {
        var active = NewUser("active@example.com");

        var blocked = NewUser("blocked@example.com");
        blocked.Block(Guid.NewGuid(), "spam", Now);

        var locked = NewUser("locked@example.com");
        locked.RecordFailedLogin(1, TimeSpan.FromMinutes(15));

        // Locked once, but the lockout has run out: active again.
        var expiredLock = NewUser("expired@example.com");
        expiredLock.RecordFailedLogin(1, TimeSpan.FromMinutes(-1));

        var deleting = NewUser("deleting@example.com");
        deleting.RequestDeletion([RoleNames.Student]);

        var unverified = User.Create("unverified@example.com", "hash", [RoleNames.Student]);
        unverified.AssignRole(_student);

        return (active, blocked, locked, expiredLock, deleting, unverified);
    }

    [Fact]
    public void Status_Blocked_IsTheAdministratorsBlockOnly()
    {
        var p = Population();
        Run([p.active, p.blocked, p.locked, p.expiredLock, p.deleting, p.unverified],
                Criteria(status: AdminUserStatuses.Blocked))
            .Should().Equal(p.blocked);
    }

    [Fact]
    public void Status_Locked_IsALockoutStillRunning()
    {
        var p = Population();
        Run([p.active, p.blocked, p.locked, p.expiredLock, p.deleting, p.unverified],
                Criteria(status: AdminUserStatuses.Locked))
            .Should().Equal(p.locked);
    }

    [Fact]
    public void Status_DeletionPending_And_Unverified()
    {
        var p = Population();
        var all = new[] { p.active, p.blocked, p.locked, p.expiredLock, p.deleting, p.unverified };

        Run(all, Criteria(status: AdminUserStatuses.DeletionPending)).Should().Equal(p.deleting);
        Run(all, Criteria(status: AdminUserStatuses.Unverified)).Should().Equal(p.unverified);
    }

    [Fact]
    public void Status_Active_IsNoneOfTheOthers_AnExpiredLockoutIncluded()
    {
        var p = Population();
        Run([p.active, p.blocked, p.locked, p.expiredLock, p.deleting, p.unverified],
                Criteria(status: AdminUserStatuses.Active))
            .Should().BeEquivalentTo([p.active, p.expiredLock]);
    }

    [Fact]
    public void NoStatus_ListsEveryone()
    {
        var p = Population();
        Run([p.active, p.blocked, p.locked, p.expiredLock, p.deleting, p.unverified], Criteria())
            .Should().HaveCount(6);
    }

    // ── Search, role, ids ────────────────────────────────────────────────────

    [Fact]
    public void Search_IsASubstringOfTheNormalizedEmail()
    {
        var anna = NewUser("anna.berg@school.no");
        var bob = NewUser("bob@example.com");
        var hanna = NewUser("hanna@school.no");

        // The handler upper-cases the term, as normalized_email is stored.
        Run([anna, bob, hanna], Criteria(search: "ANNA")).Should().BeEquivalentTo([anna, hanna]);
        Run([anna, bob, hanna], Criteria(search: "SCHOOL.NO")).Should().BeEquivalentTo([anna, hanna]);
        Run([anna, bob, hanna], Criteria(search: "NOBODY")).Should().BeEmpty();
    }

    [Fact]
    public void Role_KeepsHoldersOfThatRole()
    {
        var student = NewUser("s@example.com");
        var tutor = NewUser("t@example.com", _tutor);

        Run([student, tutor], Criteria(roleId: _tutor.Id)).Should().Equal(tutor);
    }

    [Fact]
    public void Ids_KeepOnlyThoseAccounts_AndCombineWithOtherFilters()
    {
        var a = NewUser("a@example.com");
        var b = NewUser("b@example.com");
        var c = NewUser("c@example.com");
        c.Block(Guid.NewGuid(), "spam", Now);

        Run([a, b, c], Criteria(ids: [a.Id, c.Id, Guid.NewGuid()])).Should().BeEquivalentTo([a, c]);
        Run([a, b, c], Criteria(ids: [a.Id, c.Id], status: AdminUserStatuses.Blocked)).Should().Equal(c);
    }

    // ── Sorting ───────────────────────────────────────────────────────────────

    [Fact]
    public void Sort_ByCreatedAt_BothWays_DefaultNewestFirst()
    {
        var older = NewUser("older@example.com", createdAt: Now.AddDays(-2));
        var newer = NewUser("newer@example.com", createdAt: Now.AddDays(-1));

        Run([older, newer], Criteria()).Should().Equal(newer, older);
        Run([older, newer], Criteria(sort: AdminUserSorts.CreatedAsc)).Should().Equal(older, newer);
    }

    [Fact]
    public void Sort_ByEmail_BothWays()
    {
        var b = NewUser("b@example.com");
        var a = NewUser("a@example.com");
        var c = NewUser("c@example.com");

        Run([b, a, c], Criteria(sort: AdminUserSorts.EmailAsc)).Should().Equal(a, b, c);
        Run([b, a, c], Criteria(sort: AdminUserSorts.EmailDesc)).Should().Equal(c, b, a);
    }

    [Fact]
    public void Sort_ByLastLogin_NewestFirst_NeverSignedInLast()
    {
        var never = NewUser("never@example.com");
        var yesterday = NewUser("yesterday@example.com");
        SetLastLogin(yesterday, Now.AddDays(-1));
        var today = NewUser("today@example.com");
        SetLastLogin(today, Now);

        Run([never, yesterday, today], Criteria(sort: AdminUserSorts.LastLoginDesc))
            .Should().Equal(today, yesterday, never);
    }

    [Fact]
    public void Sort_TiesAreBrokenById()
    {
        var at = Now.AddDays(-3);
        var users = Enumerable.Range(0, 5).Select(i => NewUser($"u{i}@example.com", createdAt: at)).ToList();

        Run(users, Criteria()).Select(u => u.Id).Should().BeInAscendingOrder();
        Run(users, Criteria(sort: AdminUserSorts.CreatedAsc)).Select(u => u.Id).Should().BeInAscendingOrder();
    }
}
