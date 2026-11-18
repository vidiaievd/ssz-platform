using AuthService.Application.Interfaces;
using AuthService.Application.Services;
using AuthService.Domain.Entities;
using AuthService.Domain.Events;
using AuthService.Domain.Exceptions;
using MediatR;

namespace AuthService.Application.Commands;

// ── Changing an account from the admin panel (plan 90, phase 6, step 3) ──────────────────
//
// Who may do what (Q9). The route admits the lowest level of the action; the handler checks the
// level again with the target known, because a platform administrator's account asks for more:
//
//   action            any account   platform_admin account
//   block             admin         super
//   unblock           admin         super
//   unlock            support       support
//   sessions/revoke   support       support
//   mfa/reset         support       super
//   deletion/cancel   admin         admin
//
// Never on oneself (ADMIN_SELF_CHANGE); the last super who can sign in is never blocked
// (ADMIN_LAST_SUPER); an action that would change nothing is 409 NOTHING_TO_CHANGE and leaves no
// trail. Every change writes its admin_audit row in the same save and publishes
// admin.action.performed after it.

/// <summary>What every action on an account carries: who acts, at which level, on whom and why.</summary>
public abstract record AdminUserActionCommand(
    Guid ActorId,
    string ActorLevel,
    Guid UserId,
    string Reason) : IRequest;

/// <summary>Blocks the account and ends every session it has.</summary>
public sealed record BlockUserCommand(Guid ActorId, string ActorLevel, Guid UserId, string Reason)
    : AdminUserActionCommand(ActorId, ActorLevel, UserId, Reason);

/// <summary>Lifts an administrator's block.</summary>
public sealed record UnblockUserCommand(Guid ActorId, string ActorLevel, Guid UserId, string Reason)
    : AdminUserActionCommand(ActorId, ActorLevel, UserId, Reason);

/// <summary>Lifts the lockout after failed sign-ins and the two-factor code lockout (Redis).</summary>
public sealed record UnlockUserCommand(Guid ActorId, string ActorLevel, Guid UserId, string Reason)
    : AdminUserActionCommand(ActorId, ActorLevel, UserId, Reason);

/// <summary>Ends the open sessions of one client, or of all of them when <paramref name="ClientType"/> is null.</summary>
public sealed record RevokeUserSessionsCommand(
    Guid ActorId, string ActorLevel, Guid UserId, string Reason, string? ClientType)
    : AdminUserActionCommand(ActorId, ActorLevel, UserId, Reason);

/// <summary>Turns two-factor sign-in off: TOTP and backup codes go, panel sessions end, the code count is cleared.</summary>
public sealed record ResetUserMfaCommand(Guid ActorId, string ActorLevel, Guid UserId, string Reason)
    : AdminUserActionCommand(ActorId, ActorLevel, UserId, Reason);

/// <summary>Withdraws the account's pending deletion request.</summary>
public sealed record CancelUserDeletionCommand(Guid ActorId, string ActorLevel, Guid UserId, string Reason)
    : AdminUserActionCommand(ActorId, ActorLevel, UserId, Reason);

/// <summary>The account an action is about, loaded with its sessions, backup codes and roles.</summary>
public sealed record AdminUserTarget(User User, AdminLevelAssignment? Assignment, bool IsPlatformAdmin);

/// <summary>What an action changed, for the trail.</summary>
public sealed record AdminUserChange(
    string Action,
    IReadOnlyDictionary<string, object?> Before,
    IReadOnlyDictionary<string, object?> After);

/// <summary>
/// The steps every action shares: refuse oneself, load the target, check the level against the
/// target, apply, then trail + save + publish.
/// </summary>
public abstract class AdminUserActionHandler<TCommand>(
    IUserRepository users,
    IRoleRepository roles,
    IAdminLevelRepository levels,
    IAdminAuditTrail trail,
    IUnitOfWork unitOfWork) : IRequestHandler<TCommand>
    where TCommand : AdminUserActionCommand
{
    protected IUserRepository Users => users;
    protected IAdminLevelRepository Levels => levels;

    /// <summary>The lowest level that may do this to an account of this kind.</summary>
    protected abstract string RequiredLevel(bool targetIsPlatformAdmin);

    /// <summary>Changes the account, or throws <see cref="NothingToChangeException"/>.</summary>
    protected abstract Task<AdminUserChange> ApplyAsync(TCommand command, AdminUserTarget target, CancellationToken ct);

    public async Task Handle(TCommand command, CancellationToken ct)
    {
        // Another administrator acts on one's own account: a mistake or a stolen panel session
        // must not be able to lock its owner out or quietly weaken their sign-in.
        if (command.UserId == command.ActorId)
            throw new DomainException("You cannot do this to your own account.", "ADMIN_SELF_CHANGE");

        var user = await users.FindByIdWithBackupCodesAsync(command.UserId, ct)
            ?? throw new UserNotFoundException();

        var assignment = await levels.FindAsync(user.Id, ct);
        var adminRole = await roles.FindByNameAsync(RoleNames.PlatformAdmin, ct);
        // A level row without the role (or the reverse) is still treated as an administrator:
        // the stricter rule wins when the two disagree.
        var isPlatformAdmin = assignment is not null
            || (adminRole is not null && user.Roles.Any(r => r.RoleId == adminRole.Id));

        var required = RequiredLevel(isPlatformAdmin);
        if (!AdminLevels.AtLeast(command.ActorLevel, required))
            throw new AdminLevelRequiredException(required);

        var change = await ApplyAsync(command, new AdminUserTarget(user, assignment, isPlatformAdmin), ct);

        var action = new AdminActionPerformedEvent(
            command.ActorId,
            command.ActorLevel,
            change.Action,
            AdminUserActions.TargetType,
            user.Id.ToString(),
            command.Reason.Trim(),
            change.Before,
            change.After);

        trail.Stage(action);
        await unitOfWork.SaveChangesAsync(ct);
        await trail.PublishAsync(action, ct);
    }

    protected static Dictionary<string, object?> Snapshot(User user) =>
        new() { ["email"] = user.Email };
}

public sealed class BlockUserCommandHandler(
    IUserRepository users,
    IRoleRepository roles,
    IAdminLevelRepository levels,
    IAdminAuditTrail trail,
    IUnitOfWork unitOfWork)
    : AdminUserActionHandler<BlockUserCommand>(users, roles, levels, trail, unitOfWork)
{
    protected override string RequiredLevel(bool targetIsPlatformAdmin) =>
        targetIsPlatformAdmin ? AdminLevels.Super : AdminLevels.Admin;

    protected override async Task<AdminUserChange> ApplyAsync(
        BlockUserCommand command, AdminUserTarget target, CancellationToken ct)
    {
        var user = target.User;
        if (user.IsBlocked)
            throw new NothingToChangeException("The account is already blocked.");

        if (target.Assignment is { Level: AdminLevels.Super })
            await LastSuperRule.EnsureAnotherRemainsAsync(
                Levels, user, "The last super administrator cannot be blocked.", ct);

        var activeSessions = user.RefreshTokens.Count(t => t.IsActive);
        var now = DateTimeOffset.UtcNow;
        user.Block(command.ActorId, command.Reason, now);

        var before = Snapshot(user);
        before["blocked"] = false;
        before["activeSessions"] = activeSessions;

        var after = Snapshot(user);
        after["blocked"] = true;
        after["blockedAt"] = user.BlockedAt;
        after["activeSessions"] = 0;

        return new AdminUserChange(AdminUserActions.Blocked, before, after);
    }
}

public sealed class UnblockUserCommandHandler(
    IUserRepository users,
    IRoleRepository roles,
    IAdminLevelRepository levels,
    IAdminAuditTrail trail,
    IUnitOfWork unitOfWork)
    : AdminUserActionHandler<UnblockUserCommand>(users, roles, levels, trail, unitOfWork)
{
    // Unblocking a platform administrator gives a way back into the panel — as strict as the block.
    protected override string RequiredLevel(bool targetIsPlatformAdmin) =>
        targetIsPlatformAdmin ? AdminLevels.Super : AdminLevels.Admin;

    protected override Task<AdminUserChange> ApplyAsync(
        UnblockUserCommand command, AdminUserTarget target, CancellationToken ct)
    {
        var user = target.User;

        // The block as it was — who and why — stays readable in the trail after it is lifted.
        var before = Snapshot(user);
        before["blocked"] = true;
        before["blockedAt"] = user.BlockedAt;
        before["blockedBy"] = user.BlockedBy;
        before["blockReason"] = user.BlockReason;

        if (!user.Unblock())
            throw new NothingToChangeException("The account is not blocked.");

        var after = Snapshot(user);
        after["blocked"] = false;

        return Task.FromResult(new AdminUserChange(AdminUserActions.Unblocked, before, after));
    }
}

public sealed class UnlockUserCommandHandler(
    IUserRepository users,
    IRoleRepository roles,
    IAdminLevelRepository levels,
    IAdminAuditTrail trail,
    IUnitOfWork unitOfWork,
    IRateLimitStore rateLimitStore)
    : AdminUserActionHandler<UnlockUserCommand>(users, roles, levels, trail, unitOfWork)
{
    protected override string RequiredLevel(bool targetIsPlatformAdmin) => AdminLevels.Support;

    protected override async Task<AdminUserChange> ApplyAsync(
        UnlockUserCommand command, AdminUserTarget target, CancellationToken ct)
    {
        var user = target.User;
        var key = MfaAttempts.KeyFor(user.Id);
        var now = DateTimeOffset.UtcNow;

        // Half of the lockout lives in Redis; without it the unlock can be neither done nor
        // judged, so nothing is changed (503) rather than half of it.
        RateLimitSnapshot codes;
        try
        {
            codes = await rateLimitStore.InspectAsync(key, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            throw new LockoutStoreUnavailableException();
        }

        var codesCounted = codes.Attempts > 0 || codes.LockRemaining is not null;

        var before = Snapshot(user);
        before["failedLoginAttempts"] = user.FailedLoginAttempts;
        before["lockedUntil"] = user.IsLocked ? user.LockedUntil : null;
        before["mfaCodeFailures"] = codes.Attempts;
        before["mfaCodesLockedUntil"] = codes.LockRemaining is { } left ? now.Add(left) : null;

        var signInCleared = user.ClearLockout();
        if (!signInCleared && !codesCounted)
            throw new NothingToChangeException("The account has no lockout and no failed attempts.");

        // Reset before the save: a Redis failure here leaves the database untouched too.
        if (codesCounted)
        {
            try
            {
                await rateLimitStore.ResetAsync(key, ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                throw new LockoutStoreUnavailableException();
            }
        }

        var after = Snapshot(user);
        after["failedLoginAttempts"] = 0;
        after["lockedUntil"] = null;
        after["mfaCodeFailures"] = 0;
        after["mfaCodesLockedUntil"] = null;

        return new AdminUserChange(AdminUserActions.Unlocked, before, after);
    }
}

public sealed class RevokeUserSessionsCommandHandler(
    IUserRepository users,
    IRoleRepository roles,
    IAdminLevelRepository levels,
    IAdminAuditTrail trail,
    IUnitOfWork unitOfWork)
    : AdminUserActionHandler<RevokeUserSessionsCommand>(users, roles, levels, trail, unitOfWork)
{
    protected override string RequiredLevel(bool targetIsPlatformAdmin) => AdminLevels.Support;

    protected override Task<AdminUserChange> ApplyAsync(
        RevokeUserSessionsCommand command, AdminUserTarget target, CancellationToken ct)
    {
        var user = target.User;
        var client = string.IsNullOrWhiteSpace(command.ClientType)
            ? null
            : command.ClientType.Trim().ToLowerInvariant();

        var open = user.RefreshTokens
            .Where(t => t.IsActive && (client is null || t.ClientType == client))
            .ToList();
        if (open.Count == 0)
            throw new NothingToChangeException(client is null
                ? "The account has no open sessions."
                : $"The account has no open sessions on the '{client}' client.");

        var before = Snapshot(user);
        before["clientType"] = client;
        before["sessions"] = CountByClient(open);

        if (client is null) user.RevokeAllRefreshTokens();
        else user.RevokeRefreshTokens(client);

        var after = Snapshot(user);
        after["clientType"] = client;
        after["sessions"] = CountByClient([]);

        return Task.FromResult(new AdminUserChange(AdminUserActions.SessionsRevoked, before, after));

        // Only the clients the action covered, so before and after name the same ones.
        Dictionary<string, int> CountByClient(IReadOnlyCollection<RefreshToken> tokens) =>
            (client is null ? AdminUserActions.Clients : [client])
                .ToDictionary(c => c, c => tokens.Count(t => t.ClientType == c));
    }
}

public sealed class ResetUserMfaCommandHandler(
    IUserRepository users,
    IRoleRepository roles,
    IAdminLevelRepository levels,
    IAdminAuditTrail trail,
    IUnitOfWork unitOfWork,
    IRateLimitStore rateLimitStore)
    : AdminUserActionHandler<ResetUserMfaCommand>(users, roles, levels, trail, unitOfWork)
{
    // An administrator's second factor guards the panel itself.
    protected override string RequiredLevel(bool targetIsPlatformAdmin) =>
        targetIsPlatformAdmin ? AdminLevels.Super : AdminLevels.Support;

    protected override async Task<AdminUserChange> ApplyAsync(
        ResetUserMfaCommand command, AdminUserTarget target, CancellationToken ct)
    {
        var user = target.User;

        // A secret set up but never confirmed counts too: the reset clears it as well.
        if (!user.TwoFactorEnabled && user.TotpSecretEncrypted is null && user.BackupCodes.Count == 0)
            throw new NothingToChangeException("Two-factor sign-in is not set up on this account.");

        var before = Snapshot(user);
        before["twoFactorEnabled"] = user.TwoFactorEnabled;
        before["backupCodesLeft"] = user.BackupCodes.Count(c => !c.IsUsed);
        before["adminSessions"] = user.RefreshTokens.Count(t => t.IsActive && t.ClientType == ClientTypes.Admin);

        user.DisableTwoFactor();
        Users.RemoveBackupCodesForUser(user.Id);
        // Panel sessions were opened with the factor that is now gone; web and phone sessions
        // stay — the password still guards them.
        user.RevokeRefreshTokens(ClientTypes.Admin);

        // The code count is only a guard against guessing a factor that no longer exists, and it
        // runs out by itself — a Redis failure must not stop the reset. The trail says whether it
        // was cleared.
        var counterCleared = true;
        try
        {
            await rateLimitStore.ResetAsync(MfaAttempts.KeyFor(user.Id), ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            counterCleared = false;
        }

        var after = Snapshot(user);
        after["twoFactorEnabled"] = false;
        after["backupCodesLeft"] = 0;
        after["adminSessions"] = 0;
        after["mfaCodeCounterCleared"] = counterCleared;

        return new AdminUserChange(AdminUserActions.MfaReset, before, after);
    }
}

public sealed class CancelUserDeletionCommandHandler(
    IUserRepository users,
    IRoleRepository roles,
    IAdminLevelRepository levels,
    IAdminAuditTrail trail,
    IUnitOfWork unitOfWork)
    : AdminUserActionHandler<CancelUserDeletionCommand>(users, roles, levels, trail, unitOfWork)
{
    protected override string RequiredLevel(bool targetIsPlatformAdmin) => AdminLevels.Admin;

    protected override Task<AdminUserChange> ApplyAsync(
        CancelUserDeletionCommand command, AdminUserTarget target, CancellationToken ct)
    {
        var user = target.User;

        var before = Snapshot(user);
        before["deletionRequestedAt"] = user.DeletionRequestedAt;

        if (!user.CancelDeletion())
            throw new NothingToChangeException("The account has no pending deletion.");

        var after = Snapshot(user);
        after["deletionRequestedAt"] = null;

        return Task.FromResult(new AdminUserChange(AdminUserActions.DeletionCancelled, before, after));
    }
}

/// <summary>
/// Action names and the target type of the accounts' part of the trail — mirrored in
/// <c>packages/contracts</c> (<c>AUTH_ADMIN_ACTIONS</c>).
/// </summary>
public static class AdminUserActions
{
    public const string TargetType = "user";
    public const string Blocked = "user.blocked";
    public const string Unblocked = "user.unblocked";
    public const string Unlocked = "user.unlocked";
    public const string SessionsRevoked = "user.sessions_revoked";
    public const string MfaReset = "user.mfa_reset";
    public const string DeletionCancelled = "user.deletion_cancelled";

    /// <summary>The clients whose sessions an administrator may end.</summary>
    public static readonly IReadOnlyList<string> Clients = [ClientTypes.Web, ClientTypes.Mobile, ClientTypes.Admin];
}
