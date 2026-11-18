using AuthService.Application.Commands;
using AuthService.Application.Interfaces;
using AuthService.Application.Services;
using AuthService.Application.Validators;
using AuthService.Domain.Entities;
using AuthService.Domain.Events;
using AuthService.Domain.Exceptions;
using FluentAssertions;
using MediatR;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Xunit;

namespace AuthService.UnitTests.Application;

/// <summary>Plan 90, phase 6, step 3: what an administrator may do to an account, and the trail.</summary>
public sealed class AdminUserActionTests
{
    private readonly IUserRepository _users = Substitute.For<IUserRepository>();
    private readonly IRoleRepository _roles = Substitute.For<IRoleRepository>();
    private readonly IAdminLevelRepository _levels = Substitute.For<IAdminLevelRepository>();
    private readonly IAdminAuditTrail _trail = Substitute.For<IAdminAuditTrail>();
    private readonly IUnitOfWork _unitOfWork = Substitute.For<IUnitOfWork>();
    private readonly IRateLimitStore _store = Substitute.For<IRateLimitStore>();

    private readonly Role _adminRole = Role.Create(RoleNames.PlatformAdmin);
    private readonly Guid _actor = Guid.NewGuid();

    public AdminUserActionTests()
    {
        _roles.FindByNameAsync(RoleNames.PlatformAdmin, Arg.Any<CancellationToken>()).Returns(_adminRole);
        _store.InspectAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new RateLimitSnapshot(0, null));
        _levels.CountAtLevelAsync(AdminLevels.Super, Arg.Any<CancellationToken>()).Returns(2);
    }

    // ── Fixtures ──────────────────────────────────────────────────────────────

    private User GivenUser()
    {
        var user = User.Create($"{Guid.NewGuid():N}@example.com", "hash", [RoleNames.Student]);
        user.ClearDomainEvents();
        _users.FindByIdWithBackupCodesAsync(user.Id, Arg.Any<CancellationToken>()).Returns(user);
        return user;
    }

    private void MakePlatformAdmin(User user, string level)
    {
        user.AssignRole(_adminRole);
        _levels.FindAsync(user.Id, Arg.Any<CancellationToken>())
            .Returns(AdminLevelAssignment.Create(user.Id, level, DateTimeOffset.UtcNow));
    }

    private static void AddSession(User user, string client) =>
        user.AddRefreshToken($"h-{Guid.NewGuid():N}", Guid.NewGuid().ToString(),
            DateTimeOffset.UtcNow.AddHours(1), $"device-{client}", client);

    private static void EnableMfa(User user, int backupCodes = 2)
    {
        user.SetTotpSecret("enc");
        user.ConfirmTotpVerification();
        user.EnableTwoFactor(Enumerable.Range(0, backupCodes).Select(i => BackupCode.Create(user.Id, $"c{i}")));
        user.ClearDomainEvents();
    }

    /// <summary>Puts the account in a state where the action has something to change.</summary>
    private void Prepare(string action, User user)
    {
        switch (action)
        {
            case "unblock": user.Block(Guid.NewGuid(), "spam", DateTimeOffset.UtcNow); break;
            case "unlock": user.RecordFailedLogin(1, TimeSpan.FromMinutes(15)); break;
            case "mfa": EnableMfa(user); break;
            case "deletion": user.RequestDeletion([RoleNames.Student]); break;
        }
        AddSession(user, ClientTypes.Web);
        AddSession(user, ClientTypes.Admin);
    }

    private Task Run(string action, Guid userId, string level = AdminLevels.Super, Guid? actor = null,
        string reason = "ticket 42", string? client = null)
    {
        var by = actor ?? _actor;
        return action switch
        {
            "block" => new BlockUserCommandHandler(_users, _roles, _levels, _trail, _unitOfWork)
                .Handle(new BlockUserCommand(by, level, userId, reason), default),
            "unblock" => new UnblockUserCommandHandler(_users, _roles, _levels, _trail, _unitOfWork)
                .Handle(new UnblockUserCommand(by, level, userId, reason), default),
            "unlock" => new UnlockUserCommandHandler(_users, _roles, _levels, _trail, _unitOfWork, _store)
                .Handle(new UnlockUserCommand(by, level, userId, reason), default),
            "sessions" => new RevokeUserSessionsCommandHandler(_users, _roles, _levels, _trail, _unitOfWork)
                .Handle(new RevokeUserSessionsCommand(by, level, userId, reason, client), default),
            "mfa" => new ResetUserMfaCommandHandler(_users, _roles, _levels, _trail, _unitOfWork, _store)
                .Handle(new ResetUserMfaCommand(by, level, userId, reason), default),
            "deletion" => new CancelUserDeletionCommandHandler(_users, _roles, _levels, _trail, _unitOfWork)
                .Handle(new CancelUserDeletionCommand(by, level, userId, reason), default),
            _ => throw new ArgumentOutOfRangeException(nameof(action)),
        };
    }

    private AdminActionPerformedEvent StagedAction()
    {
        var call = _trail.ReceivedCalls().Single(c => c.GetMethodInfo().Name == nameof(IAdminAuditTrail.Stage));
        return (AdminActionPerformedEvent)call.GetArguments()[0]!;
    }

    private async Task NothingWasWritten()
    {
        _trail.DidNotReceiveWithAnyArgs().Stage(default!);
        await _unitOfWork.DidNotReceiveWithAnyArgs().SaveChangesAsync(default);
        await _trail.DidNotReceiveWithAnyArgs().PublishAsync(default!, default);
    }

    // ── The level matrix (Q9) ─────────────────────────────────────────────────

    public static TheoryData<string, bool, string, bool> Matrix() => new()
    {
        // action, target is platform_admin, actor level, allowed
        { "block", false, AdminLevels.Support, false },
        { "block", false, AdminLevels.Admin, true },
        { "block", true, AdminLevels.Admin, false },
        { "block", true, AdminLevels.Super, true },
        { "unblock", false, AdminLevels.Support, false },
        { "unblock", false, AdminLevels.Admin, true },
        { "unblock", true, AdminLevels.Admin, false },
        { "unblock", true, AdminLevels.Super, true },
        { "unlock", false, AdminLevels.Support, true },
        { "unlock", true, AdminLevels.Support, true },
        { "sessions", false, AdminLevels.Support, true },
        { "sessions", true, AdminLevels.Support, true },
        { "mfa", false, AdminLevels.Support, true },
        { "mfa", true, AdminLevels.Admin, false },
        { "mfa", true, AdminLevels.Super, true },
        { "deletion", false, AdminLevels.Support, false },
        { "deletion", false, AdminLevels.Admin, true },
        { "deletion", true, AdminLevels.Admin, true },
    };

    [Theory]
    [MemberData(nameof(Matrix))]
    public async Task Levels_FollowTheMatrix(string action, bool targetIsPlatformAdmin, string level, bool allowed)
    {
        var user = GivenUser();
        if (targetIsPlatformAdmin) MakePlatformAdmin(user, AdminLevels.Support);
        Prepare(action, user);

        var act = () => Run(action, user.Id, level);

        if (allowed)
        {
            await act.Should().NotThrowAsync();
            await _unitOfWork.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
        }
        else
        {
            var thrown = await act.Should().ThrowAsync<AdminLevelRequiredException>();
            thrown.Which.Code.Should().Be("ADMIN_LEVEL_REQUIRED");
            await NothingWasWritten();
        }
    }

    [Fact]
    public async Task Levels_ARoleWithoutALevelRow_IsStillAPlatformAdmin()
    {
        var user = GivenUser();
        user.AssignRole(_adminRole);

        var act = () => Run("block", user.Id, AdminLevels.Admin);

        (await act.Should().ThrowAsync<AdminLevelRequiredException>()).Which.RequiredLevel
            .Should().Be(AdminLevels.Super);
    }

    [Fact]
    public async Task Levels_AWebTokenWithoutALevel_IsRefusedEvenForSupportActions()
    {
        var user = GivenUser();
        Prepare("sessions", user);

        var act = () => Run("sessions", user.Id, level: "");

        await act.Should().ThrowAsync<AdminLevelRequiredException>();
    }

    [Theory]
    [InlineData("block")]
    [InlineData("unblock")]
    [InlineData("unlock")]
    [InlineData("sessions")]
    [InlineData("mfa")]
    [InlineData("deletion")]
    public async Task Self_IsRefused_ForEveryAction(string action)
    {
        var user = GivenUser();
        Prepare(action, user);

        var act = () => Run(action, user.Id, actor: user.Id);

        (await act.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("ADMIN_SELF_CHANGE");
        await NothingWasWritten();
    }

    [Fact]
    public async Task UnknownAccount_IsNotFound()
    {
        var act = () => Run("block", Guid.NewGuid());

        await act.Should().ThrowAsync<UserNotFoundException>();
    }

    [Theory]
    [InlineData("block")]
    [InlineData("unblock")]
    [InlineData("unlock")]
    [InlineData("mfa")]
    [InlineData("deletion")]
    public async Task NoEffect_Is409_WithoutATrail(string action)
    {
        var user = GivenUser();
        if (action == "block") user.Block(Guid.NewGuid(), "earlier", DateTimeOffset.UtcNow);

        var act = () => Run(action, user.Id);

        (await act.Should().ThrowAsync<NothingToChangeException>()).Which.Code.Should().Be("NOTHING_TO_CHANGE");
        await NothingWasWritten();
    }

    [Fact]
    public async Task TrailIsStaged_BeforeTheSave_AndPublishedAfterIt()
    {
        var user = GivenUser();
        var calls = new List<string>();
        _trail.When(t => t.Stage(Arg.Any<AdminActionPerformedEvent>())).Do(_ => calls.Add("stage"));
        _unitOfWork.When(u => u.SaveChangesAsync(Arg.Any<CancellationToken>())).Do(_ => calls.Add("save"));
        _trail.When(t => t.PublishAsync(Arg.Any<AdminActionPerformedEvent>(), Arg.Any<CancellationToken>()))
            .Do(_ => calls.Add("publish"));

        await Run("block", user.Id);

        calls.Should().Equal("stage", "save", "publish");
    }

    // ── Block / unblock ───────────────────────────────────────────────────────

    [Fact]
    public async Task Block_SetsTheBlock_EndsEverySession_AndRecordsIt()
    {
        var user = GivenUser();
        AddSession(user, ClientTypes.Web);
        AddSession(user, ClientTypes.Mobile);

        await Run("block", user.Id, AdminLevels.Admin, reason: "  fraud  ");

        user.IsBlocked.Should().BeTrue();
        user.BlockedBy.Should().Be(_actor);
        user.BlockReason.Should().Be("fraud");
        user.RefreshTokens.Should().OnlyContain(t => t.IsRevoked);

        var e = StagedAction();
        e.Action.Should().Be(AdminUserActions.Blocked);
        e.TargetType.Should().Be("user");
        e.TargetId.Should().Be(user.Id.ToString());
        e.ActorId.Should().Be(_actor);
        e.ActorLevel.Should().Be(AdminLevels.Admin);
        e.Reason.Should().Be("fraud");
        e.Before!["email"].Should().Be(user.Email);
        e.Before["blocked"].Should().Be(false);
        e.Before["activeSessions"].Should().Be(2);
        e.After!["blocked"].Should().Be(true);
        e.After["blockedAt"].Should().Be(user.BlockedAt);
        e.After["activeSessions"].Should().Be(0);
    }

    [Fact]
    public async Task Block_TheLastSuper_IsRefused()
    {
        var user = GivenUser();
        MakePlatformAdmin(user, AdminLevels.Super);
        _levels.CountAtLevelAsync(AdminLevels.Super, Arg.Any<CancellationToken>()).Returns(1);

        var act = () => Run("block", user.Id);

        (await act.Should().ThrowAsync<DomainException>()).Which.Code.Should().Be("ADMIN_LAST_SUPER");
        user.IsBlocked.Should().BeFalse();
        await NothingWasWritten();
    }

    [Fact]
    public async Task Block_ASuper_WhenAnotherCanSignIn_IsAllowed()
    {
        var user = GivenUser();
        MakePlatformAdmin(user, AdminLevels.Super);

        await Run("block", user.Id);

        user.IsBlocked.Should().BeTrue();
    }

    [Fact]
    public async Task Unblock_LiftsTheBlock_AndTheTrailKeepsWhoAndWhy()
    {
        var user = GivenUser();
        var blocker = Guid.NewGuid();
        user.Block(blocker, "spam", DateTimeOffset.UtcNow);

        await Run("unblock", user.Id, AdminLevels.Admin);

        user.IsBlocked.Should().BeFalse();
        var e = StagedAction();
        e.Action.Should().Be(AdminUserActions.Unblocked);
        e.Before!["blockedBy"].Should().Be(blocker);
        e.Before["blockReason"].Should().Be("spam");
        e.After!["blocked"].Should().Be(false);
        e.After.Should().NotContainKey("blockReason");
    }

    // ── Unlock ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task Unlock_ClearsTheSignInLockout_AndTheCodeCount()
    {
        var user = GivenUser();
        user.RecordFailedLogin(1, TimeSpan.FromMinutes(15));
        _store.InspectAsync(MfaAttempts.KeyFor(user.Id), Arg.Any<CancellationToken>())
            .Returns(new RateLimitSnapshot(5, TimeSpan.FromMinutes(10)));

        await Run("unlock", user.Id, AdminLevels.Support);

        user.IsCurrentlyLocked().Should().BeFalse();
        user.FailedLoginAttempts.Should().Be(0);
        await _store.Received(1).ResetAsync(MfaAttempts.KeyFor(user.Id), Arg.Any<CancellationToken>());
        var e = StagedAction();
        e.Action.Should().Be(AdminUserActions.Unlocked);
        e.Before!["failedLoginAttempts"].Should().Be(1);
        e.Before["lockedUntil"].Should().NotBeNull();
        e.Before["mfaCodeFailures"].Should().Be(5);
        e.Before["mfaCodesLockedUntil"].Should().NotBeNull();
        e.After!["mfaCodeFailures"].Should().Be(0);
    }

    [Fact]
    public async Task Unlock_OnlyTheCodeCount_IsAnEffect()
    {
        var user = GivenUser();
        _store.InspectAsync(MfaAttempts.KeyFor(user.Id), Arg.Any<CancellationToken>())
            .Returns(new RateLimitSnapshot(2, null));

        await Run("unlock", user.Id, AdminLevels.Support);

        await _store.Received(1).ResetAsync(MfaAttempts.KeyFor(user.Id), Arg.Any<CancellationToken>());
        await _unitOfWork.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Unlock_OnlyTheSignInLockout_LeavesRedisAlone()
    {
        var user = GivenUser();
        user.RecordFailedLogin(5, TimeSpan.FromMinutes(15));

        await Run("unlock", user.Id, AdminLevels.Support);

        user.FailedLoginAttempts.Should().Be(0);
        await _store.DidNotReceiveWithAnyArgs().ResetAsync(default!, default);
    }

    [Fact]
    public async Task Unlock_WhenRedisIsDown_ChangesNothing()
    {
        var user = GivenUser();
        user.RecordFailedLogin(1, TimeSpan.FromMinutes(15));
        _store.InspectAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .ThrowsAsync(new InvalidOperationException("redis down"));

        var act = () => Run("unlock", user.Id, AdminLevels.Support);

        (await act.Should().ThrowAsync<LockoutStoreUnavailableException>()).Which.Code
            .Should().Be("LOCKOUT_STORE_UNAVAILABLE");
        user.FailedLoginAttempts.Should().Be(1);
        await NothingWasWritten();
    }

    [Fact]
    public async Task Unlock_WhenTheRedisResetFails_SavesNothing()
    {
        var user = GivenUser();
        _store.InspectAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .Returns(new RateLimitSnapshot(3, null));
        _store.ResetAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .ThrowsAsync(new InvalidOperationException("redis down"));

        var act = () => Run("unlock", user.Id, AdminLevels.Support);

        await act.Should().ThrowAsync<LockoutStoreUnavailableException>();
        await NothingWasWritten();
    }

    [Fact]
    public async Task Unlock_DoesNotLiftAnAdministratorsBlock()
    {
        var user = GivenUser();
        user.Block(Guid.NewGuid(), "spam", DateTimeOffset.UtcNow);
        user.RecordFailedLogin(1, TimeSpan.FromMinutes(15));

        await Run("unlock", user.Id, AdminLevels.Support);

        user.IsBlocked.Should().BeTrue();
    }

    // ── Sessions ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task Sessions_OfOneClient_EndOnlyThatClient()
    {
        var user = GivenUser();
        AddSession(user, ClientTypes.Web);
        AddSession(user, ClientTypes.Web);
        AddSession(user, ClientTypes.Mobile);

        await Run("sessions", user.Id, AdminLevels.Support, client: "Web");

        user.RefreshTokens.Where(t => t.ClientType == ClientTypes.Web).Should().OnlyContain(t => t.IsRevoked);
        user.RefreshTokens.Single(t => t.ClientType == ClientTypes.Mobile).IsRevoked.Should().BeFalse();
        var e = StagedAction();
        e.Action.Should().Be(AdminUserActions.SessionsRevoked);
        e.Before!["clientType"].Should().Be(ClientTypes.Web);
        e.Before["sessions"].Should().BeEquivalentTo(new Dictionary<string, int> { [ClientTypes.Web] = 2 });
        e.After!["sessions"].Should().BeEquivalentTo(new Dictionary<string, int> { [ClientTypes.Web] = 0 });
    }

    [Fact]
    public async Task Sessions_WithoutAClient_EndEveryClient()
    {
        var user = GivenUser();
        AddSession(user, ClientTypes.Web);
        AddSession(user, ClientTypes.Admin);

        await Run("sessions", user.Id, AdminLevels.Support);

        user.RefreshTokens.Should().OnlyContain(t => t.IsRevoked);
        var e = StagedAction();
        e.Before!["clientType"].Should().BeNull();
        e.Before["sessions"].Should().BeEquivalentTo(new Dictionary<string, int>
        {
            [ClientTypes.Web] = 1, [ClientTypes.Mobile] = 0, [ClientTypes.Admin] = 1,
        });
    }

    [Fact]
    public async Task Sessions_NoneOpenOnThatClient_Is409()
    {
        var user = GivenUser();
        AddSession(user, ClientTypes.Web);

        var act = () => Run("sessions", user.Id, AdminLevels.Support, client: ClientTypes.Mobile);

        await act.Should().ThrowAsync<NothingToChangeException>();
        user.RefreshTokens.Single().IsRevoked.Should().BeFalse();
        await NothingWasWritten();
    }

    // ── MFA reset ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task MfaReset_TurnsTheFactorOff_EndsPanelSessions_AndClearsTheCount()
    {
        var user = GivenUser();
        EnableMfa(user, backupCodes: 3);
        AddSession(user, ClientTypes.Admin);
        AddSession(user, ClientTypes.Web);

        await Run("mfa", user.Id, AdminLevels.Support);

        user.TwoFactorEnabled.Should().BeFalse();
        user.TotpSecretEncrypted.Should().BeNull();
        user.BackupCodes.Should().BeEmpty();
        _users.Received(1).RemoveBackupCodesForUser(user.Id);
        user.RefreshTokens.Single(t => t.ClientType == ClientTypes.Admin).IsRevoked.Should().BeTrue();
        user.RefreshTokens.Single(t => t.ClientType == ClientTypes.Web).IsRevoked.Should().BeFalse();
        await _store.Received(1).ResetAsync(MfaAttempts.KeyFor(user.Id), Arg.Any<CancellationToken>());

        var e = StagedAction();
        e.Action.Should().Be(AdminUserActions.MfaReset);
        e.Before!["twoFactorEnabled"].Should().Be(true);
        e.Before["backupCodesLeft"].Should().Be(3);
        e.Before["adminSessions"].Should().Be(1);
        e.After!["twoFactorEnabled"].Should().Be(false);
        e.After["mfaCodeCounterCleared"].Should().Be(true);
    }

    [Fact]
    public async Task MfaReset_ASetupNeverConfirmed_IsClearedToo()
    {
        var user = GivenUser();
        user.SetTotpSecret("enc");

        await Run("mfa", user.Id, AdminLevels.Support);

        user.TotpSecretEncrypted.Should().BeNull();
    }

    [Fact]
    public async Task MfaReset_WhenRedisIsDown_StillResets_AndSaysSo()
    {
        var user = GivenUser();
        EnableMfa(user);
        _store.ResetAsync(Arg.Any<string>(), Arg.Any<CancellationToken>())
            .ThrowsAsync(new InvalidOperationException("redis down"));

        await Run("mfa", user.Id, AdminLevels.Support);

        user.TwoFactorEnabled.Should().BeFalse();
        StagedAction().After!["mfaCodeCounterCleared"].Should().Be(false);
        await _unitOfWork.Received(1).SaveChangesAsync(Arg.Any<CancellationToken>());
    }

    // ── Deletion ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task CancelDeletion_WithdrawsTheRequest()
    {
        var user = GivenUser();
        user.RequestDeletion([RoleNames.Student]);
        var requestedAt = user.DeletionRequestedAt;

        await Run("deletion", user.Id, AdminLevels.Admin);

        user.DeletionRequestedAt.Should().BeNull();
        var e = StagedAction();
        e.Action.Should().Be(AdminUserActions.DeletionCancelled);
        e.Before!["deletionRequestedAt"].Should().Be(requestedAt);
        e.After!["deletionRequestedAt"].Should().BeNull();
    }

    // ── The last-super rule elsewhere ─────────────────────────────────────────

    [Fact]
    public async Task LoweringABlockedSuper_TakesNoOneAway_AndIsAllowed()
    {
        var user = GivenUser();
        MakePlatformAdmin(user, AdminLevels.Super);
        user.Block(Guid.NewGuid(), "left", DateTimeOffset.UtcNow);
        _users.FindByIdWithRolesAsync(user.Id, Arg.Any<CancellationToken>()).Returns(user);
        // Only the other, unblocked super counts.
        _levels.CountAtLevelAsync(AdminLevels.Super, Arg.Any<CancellationToken>()).Returns(1);

        var act = () => new SetAdminLevelCommandHandler(_users, _roles, _levels, _trail, _unitOfWork)
            .Handle(new SetAdminLevelCommand(_actor, AdminLevels.Super, user.Id, AdminLevels.Admin, "x"), default);

        await act.Should().NotThrowAsync();
    }

    // ── Validators ────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("", false)]
    [InlineData("   ", false)]
    [InlineData("ticket 42", true)]
    public void Validators_NeedAReason(string reason, bool valid)
    {
        new BlockUserCommandValidator().Validate(new BlockUserCommand(_actor, AdminLevels.Admin, Guid.NewGuid(), reason))
            .IsValid.Should().Be(valid);
        new UnlockUserCommandValidator().Validate(new UnlockUserCommand(_actor, AdminLevels.Admin, Guid.NewGuid(), reason))
            .IsValid.Should().Be(valid);
        new ResetUserMfaCommandValidator().Validate(new ResetUserMfaCommand(_actor, AdminLevels.Admin, Guid.NewGuid(), reason))
            .IsValid.Should().Be(valid);
    }

    [Fact]
    public void Validators_TheReasonIsAtMost500()
    {
        new UnblockUserCommandValidator()
            .Validate(new UnblockUserCommand(_actor, AdminLevels.Admin, Guid.NewGuid(), new string('x', 501)))
            .IsValid.Should().BeFalse();
        new CancelUserDeletionCommandValidator()
            .Validate(new CancelUserDeletionCommand(_actor, AdminLevels.Admin, Guid.NewGuid(), new string('x', 500)))
            .IsValid.Should().BeTrue();
    }

    [Theory]
    [InlineData(null, true)]
    [InlineData("", true)]
    [InlineData("web", true)]
    [InlineData("Mobile", true)]
    [InlineData("admin", true)]
    [InlineData("desktop", false)]
    public void SessionsValidator_TakesAKnownClientOrNone(string? client, bool valid)
    {
        new RevokeUserSessionsCommandValidator()
            .Validate(new RevokeUserSessionsCommand(_actor, AdminLevels.Support, Guid.NewGuid(), "why", client))
            .IsValid.Should().Be(valid);
    }

    // ── Domain ────────────────────────────────────────────────────────────────

    [Fact]
    public void ClearLockout_WithNothingToClear_ReportsFalse()
    {
        var user = User.Create("a@example.com", "h", [RoleNames.Student]);

        user.ClearLockout().Should().BeFalse();
        user.RecordFailedLogin(5, TimeSpan.FromMinutes(15));
        user.ClearLockout().Should().BeTrue();
        user.IsLocked.Should().BeFalse();
        user.LastFailedLoginAt.Should().BeNull();
    }

    [Fact]
    public void CancelDeletion_WithoutARequest_ReportsFalse()
    {
        var user = User.Create("a@example.com", "h", [RoleNames.Student]);

        user.CancelDeletion().Should().BeFalse();
        user.RequestDeletion([RoleNames.Student]);
        user.CancelDeletion().Should().BeTrue();
    }

    [Fact]
    public void Handlers_AreMediatRHandlers() =>
        typeof(BlockUserCommandHandler).Should().Implement<IRequestHandler<BlockUserCommand>>();
}
