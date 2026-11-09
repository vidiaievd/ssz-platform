using AuthService.Application.Commands;
using AuthService.Application.Interfaces;
using AuthService.Application.Services;
using AuthService.Application.Validators;
using AuthService.Domain.Entities;
using AuthService.Domain.Events;
using AuthService.Domain.Exceptions;
using FluentAssertions;
using NSubstitute;
using Xunit;

namespace AuthService.UnitTests.Application;

/// <summary>Plan 90, step 3: managing administrators and the trail it leaves.</summary>
public sealed class AdminManagementTests
{
    private readonly IUserRepository _users = Substitute.For<IUserRepository>();
    private readonly IRoleRepository _roles = Substitute.For<IRoleRepository>();
    private readonly IAdminLevelRepository _levels = Substitute.For<IAdminLevelRepository>();
    private readonly IAdminAuditTrail _trail = Substitute.For<IAdminAuditTrail>();
    private readonly IUnitOfWork _unitOfWork = Substitute.For<IUnitOfWork>();

    private readonly Role _adminRole = Role.Create(RoleNames.PlatformAdmin);
    private readonly Guid _actor = Guid.NewGuid();

    public AdminManagementTests()
    {
        _roles.FindByNameAsync(RoleNames.PlatformAdmin, Arg.Any<CancellationToken>()).Returns(_adminRole);
    }

    private SetAdminLevelCommandHandler SetHandler() => new(_users, _roles, _levels, _trail, _unitOfWork);
    private RevokeAdminCommandHandler RevokeHandler() => new(_users, _roles, _levels, _trail, _unitOfWork);

    private User GivenUser(string email = "new@example.com")
    {
        var user = User.Create(email, "hash", [RoleNames.Student]);
        user.ClearDomainEvents();
        _users.FindByIdWithRolesAsync(user.Id, Arg.Any<CancellationToken>()).Returns(user);
        _users.FindByIdWithTokensAsync(user.Id, Arg.Any<CancellationToken>()).Returns(user);
        return user;
    }

    private AdminLevelAssignment GivenLevel(User user, string level)
    {
        var a = AdminLevelAssignment.Create(user.Id, level, DateTimeOffset.UtcNow);
        _levels.FindAsync(user.Id, Arg.Any<CancellationToken>()).Returns(a);
        return a;
    }

    private SetAdminLevelCommand Set(Guid userId, string level = AdminLevels.Admin, string reason = "new hire") =>
        new(_actor, AdminLevels.Super, userId, level, reason);

    private RevokeAdminCommand Revoke(Guid userId, string reason = "left the team") =>
        new(_actor, AdminLevels.Super, userId, reason);

    // ── Grant / change ────────────────────────────────────────────────────────

    [Fact]
    public async Task Set_NewAdministrator_GetsRoleAndLevel_AndATrailRow()
    {
        var user = GivenUser();
        AdminLevelAssignment? added = null;
        _levels.Add(Arg.Do<AdminLevelAssignment>(a => added = a));

        var result = await SetHandler().Handle(Set(user.Id), default);

        result.Level.Should().Be(AdminLevels.Admin);
        user.Roles.Should().ContainSingle(r => r.RoleId == _adminRole.Id);
        added!.GrantedBy.Should().Be(_actor);
        _trail.Received(1).Stage(Arg.Is<AdminActionPerformedEvent>(e =>
            e.Action == AdminActions.Granted
            && e.ActorId == _actor
            && e.ActorLevel == AdminLevels.Super
            && e.TargetId == user.Id.ToString()
            && e.Reason == "new hire"
            && e.Before == null
            && (string)e.After!["level"]! == AdminLevels.Admin));
        await _unitOfWork.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
        await _trail.Received(1).PublishAsync(Arg.Any<AdminActionPerformedEvent>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Set_TheTrailIsStaged_BeforeTheSave_AndPublishedAfterIt()
    {
        var user = GivenUser();
        var calls = new List<string>();
        _trail.When(t => t.Stage(Arg.Any<AdminActionPerformedEvent>())).Do(_ => calls.Add("stage"));
        _unitOfWork.When(u => u.SaveChangesAsync(Arg.Any<CancellationToken>())).Do(_ => calls.Add("save"));
        _trail.When(t => t.PublishAsync(Arg.Any<AdminActionPerformedEvent>(), Arg.Any<CancellationToken>()))
            .Do(_ => calls.Add("publish"));

        await SetHandler().Handle(Set(user.Id), default);

        calls.Should().Equal("stage", "save", "publish");
    }

    [Fact]
    public async Task Set_ExistingAdministrator_ChangesLevel_AndRecordsBeforeAndAfter()
    {
        var user = GivenUser();
        user.AssignRole(_adminRole);
        var assignment = GivenLevel(user, AdminLevels.Support);

        await SetHandler().Handle(Set(user.Id, AdminLevels.Admin), default);

        assignment.Level.Should().Be(AdminLevels.Admin);
        assignment.GrantedBy.Should().Be(_actor);
        _levels.DidNotReceiveWithAnyArgs().Add(default!);
        _trail.Received(1).Stage(Arg.Is<AdminActionPerformedEvent>(e =>
            e.Action == AdminActions.LevelChanged
            && (string)e.Before!["level"]! == AdminLevels.Support
            && (string)e.After!["level"]! == AdminLevels.Admin));
    }

    [Fact]
    public async Task Set_SameLevel_ChangesNothing_AndLeavesNoTrail()
    {
        var user = GivenUser();
        user.AssignRole(_adminRole);
        GivenLevel(user, AdminLevels.Admin);

        var result = await SetHandler().Handle(Set(user.Id, AdminLevels.Admin), default);

        result.Level.Should().Be(AdminLevels.Admin);
        _trail.DidNotReceiveWithAnyArgs().Stage(default!);
        await _unitOfWork.DidNotReceiveWithAnyArgs().SaveChangesAsync(default);
    }

    [Fact]
    public async Task Set_OwnLevel_IsRefused()
    {
        var user = GivenUser();

        var act = () => SetHandler().Handle(
            new SetAdminLevelCommand(user.Id, AdminLevels.Super, user.Id, AdminLevels.Support, "x"), default);

        (await act.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("ADMIN_SELF_CHANGE");
        await _unitOfWork.DidNotReceiveWithAnyArgs().SaveChangesAsync(default);
    }

    [Fact]
    public async Task Set_LoweringTheLastSuper_IsRefused()
    {
        var user = GivenUser();
        user.AssignRole(_adminRole);
        GivenLevel(user, AdminLevels.Super);
        _levels.CountAtLevelAsync(AdminLevels.Super, Arg.Any<CancellationToken>()).Returns(1);

        var act = () => SetHandler().Handle(Set(user.Id, AdminLevels.Admin), default);

        (await act.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("ADMIN_LAST_SUPER");
    }

    [Fact]
    public async Task Set_LoweringASuper_WhenAnotherRemains_IsAllowed()
    {
        var user = GivenUser();
        user.AssignRole(_adminRole);
        var assignment = GivenLevel(user, AdminLevels.Super);
        _levels.CountAtLevelAsync(AdminLevels.Super, Arg.Any<CancellationToken>()).Returns(2);

        await SetHandler().Handle(Set(user.Id, AdminLevels.Admin), default);

        assignment.Level.Should().Be(AdminLevels.Admin);
    }

    [Fact]
    public async Task Set_UnknownAccount_IsRefused()
    {
        var act = () => SetHandler().Handle(Set(Guid.NewGuid()), default);

        await act.Should().ThrowAsync<UserNotFoundException>();
    }

    // ── Revoke ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Revoke_TakesRoleAndLevelAway_AndEndsOnlyPanelSessions()
    {
        var user = GivenUser();
        user.AssignRole(_adminRole);
        user.AddRefreshToken("h-admin", "f1", DateTimeOffset.UtcNow.AddHours(1), clientType: ClientTypes.Admin);
        user.AddRefreshToken("h-web", "f2", DateTimeOffset.UtcNow.AddHours(1), clientType: ClientTypes.Web);
        var assignment = GivenLevel(user, AdminLevels.Admin);

        await RevokeHandler().Handle(Revoke(user.Id), default);

        user.Roles.Should().BeEmpty();
        _levels.Received(1).Remove(assignment);
        user.RefreshTokens.Single(t => t.ClientType == ClientTypes.Admin).IsRevoked.Should().BeTrue();
        user.RefreshTokens.Single(t => t.ClientType == ClientTypes.Web).IsRevoked.Should().BeFalse();
        _trail.Received(1).Stage(Arg.Is<AdminActionPerformedEvent>(e =>
            e.Action == AdminActions.Revoked
            && e.After == null
            && (string)e.Before!["level"]! == AdminLevels.Admin
            && e.Reason == "left the team"));
        await _unitOfWork.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Revoke_Yourself_IsRefused()
    {
        var user = GivenUser();
        GivenLevel(user, AdminLevels.Super);

        var act = () => RevokeHandler().Handle(
            new RevokeAdminCommand(user.Id, AdminLevels.Super, user.Id, "x"), default);

        (await act.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("ADMIN_SELF_CHANGE");
    }

    [Fact]
    public async Task Revoke_TheLastSuper_IsRefused()
    {
        var user = GivenUser();
        GivenLevel(user, AdminLevels.Super);
        _levels.CountAtLevelAsync(AdminLevels.Super, Arg.Any<CancellationToken>()).Returns(1);

        var act = () => RevokeHandler().Handle(Revoke(user.Id), default);

        (await act.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("ADMIN_LAST_SUPER");
        await _unitOfWork.DidNotReceiveWithAnyArgs().SaveChangesAsync(default);
    }

    [Fact]
    public async Task Revoke_NotAnAdministrator_IsRefused()
    {
        var user = GivenUser();

        var act = () => RevokeHandler().Handle(Revoke(user.Id), default);

        (await act.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("ADMIN_NOT_FOUND");
    }

    // ── List ──────────────────────────────────────────────────────────────────

    [Fact]
    public async Task List_MapsTheRepositoryRows()
    {
        var id = Guid.NewGuid();
        _levels.ListAsync(Arg.Any<CancellationToken>()).Returns(
            [new AdminListItem(id, "a@example.com", AdminLevels.Super, DateTimeOffset.UtcNow, null, true)]);

        var result = await new ListAdminsQueryHandler(_levels).Handle(new ListAdminsQuery(), default);

        result.Items.Should().ContainSingle(i => i.UserId == id && i.TwoFactorEnabled);
    }

    // ── Validators ────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("support", "why", true)]
    [InlineData("Super", "why", true)]
    [InlineData("owner", "why", false)]
    [InlineData("admin", "", false)]
    [InlineData("admin", "   ", false)]
    public void SetValidator_NeedsAKnownLevelAndAReason(string level, string reason, bool valid)
    {
        var result = new SetAdminLevelCommandValidator().Validate(
            new SetAdminLevelCommand(_actor, AdminLevels.Super, Guid.NewGuid(), level, reason));

        result.IsValid.Should().Be(valid);
    }

    [Fact]
    public void RevokeValidator_NeedsAReason_NotTooLong()
    {
        var validator = new RevokeAdminCommandValidator();

        validator.Validate(Revoke(Guid.NewGuid(), "")).IsValid.Should().BeFalse();
        validator.Validate(Revoke(Guid.NewGuid(), new string('x', 501))).IsValid.Should().BeFalse();
        validator.Validate(Revoke(Guid.NewGuid(), "ok")).IsValid.Should().BeTrue();
    }

    // ── The event and its trail row ───────────────────────────────────────────

    [Fact]
    public void TrailEntry_KeepsTheEventId_AndBothSidesAsJson()
    {
        var e = new AdminActionPerformedEvent(
            _actor, AdminLevels.Super, AdminActions.LevelChanged, AdminActions.TargetType, "t", "why",
            AdminMapping(AdminLevels.Support), AdminMapping(AdminLevels.Admin));

        var entry = AdminAuditEntry.From(e);

        entry.Id.Should().Be(e.EventId);
        entry.BeforeJson.Should().Contain("\"support\"");
        entry.AfterJson.Should().Contain("\"admin\"");
        AdminAuditEntry.From(e with { Before = null }).BeforeJson.Should().BeNull();
    }

    private static IReadOnlyDictionary<string, object?> AdminMapping(string level) =>
        new Dictionary<string, object?> { ["email"] = "a@example.com", ["level"] = level };
}
