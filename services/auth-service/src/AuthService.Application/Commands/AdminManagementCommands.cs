using AuthService.Application.DTOs;
using AuthService.Application.Interfaces;
using AuthService.Application.Services;
using AuthService.Domain.Entities;
using AuthService.Domain.Events;
using AuthService.Domain.Exceptions;
using MediatR;

namespace AuthService.Application.Commands;

// ── Managing administrators (plan 90) — super only, enforced at the route ─────

public sealed record ListAdminsQuery : IRequest<AdminListResponse>;

public sealed class ListAdminsQueryHandler(IAdminLevelRepository levels)
    : IRequestHandler<ListAdminsQuery, AdminListResponse>
{
    public async Task<AdminListResponse> Handle(ListAdminsQuery query, CancellationToken ct)
    {
        var items = await levels.ListAsync(ct);
        return new AdminListResponse(items.Select(AdminMapping.ToResponse).ToList());
    }
}

/// <summary>Grants a platform administrator a level, or changes the level they hold.</summary>
public sealed record SetAdminLevelCommand(
    Guid ActorId,
    string ActorLevel,
    Guid UserId,
    string Level,
    string Reason) : IRequest<AdminResponse>;

public sealed class SetAdminLevelCommandHandler(
    IUserRepository users,
    IRoleRepository roles,
    IAdminLevelRepository levels,
    IAdminAuditTrail trail,
    IUnitOfWork unitOfWork)
    : IRequestHandler<SetAdminLevelCommand, AdminResponse>
{
    public async Task<AdminResponse> Handle(SetAdminLevelCommand command, CancellationToken ct)
    {
        var level = command.Level.Trim().ToLowerInvariant();

        // One's own level is changed by another super: otherwise a mistake or a stolen session
        // could quietly lower the only way back in.
        if (command.UserId == command.ActorId)
            throw new DomainException("You cannot change your own admin level.", "ADMIN_SELF_CHANGE");

        var user = await users.FindByIdWithRolesAsync(command.UserId, ct)
            ?? throw new UserNotFoundException();

        var role = await roles.FindByNameAsync(RoleNames.PlatformAdmin, ct)
            ?? throw new DomainException(
                $"Role '{RoleNames.PlatformAdmin}' not found.", "ROLE_NOT_FOUND");

        var assignment = await levels.FindAsync(user.Id, ct);
        var hasRole = user.Roles.Any(r => r.RoleId == role.Id);

        if (assignment is not null && assignment.Level == level && hasRole)
            return AdminMapping.ToResponse(assignment, user);

        if (assignment is { Level: AdminLevels.Super } && level != AdminLevels.Super
            && await levels.CountAtLevelAsync(AdminLevels.Super, ct) <= 1)
            throw new DomainException("The last super administrator cannot be lowered.", "ADMIN_LAST_SUPER");

        var now = DateTimeOffset.UtcNow;
        var before = assignment is null ? null : AdminMapping.Snapshot(user.Email, assignment.Level);

        user.AssignRole(role);
        if (assignment is null)
        {
            assignment = AdminLevelAssignment.Create(user.Id, level, now, command.ActorId);
            levels.Add(assignment);
        }
        else
        {
            assignment.ChangeTo(level, now, command.ActorId);
        }

        var action = new AdminActionPerformedEvent(
            command.ActorId,
            command.ActorLevel,
            before is null ? AdminActions.Granted : AdminActions.LevelChanged,
            AdminActions.TargetType,
            user.Id.ToString(),
            command.Reason.Trim(),
            before,
            AdminMapping.Snapshot(user.Email, level));

        trail.Stage(action);
        await unitOfWork.SaveChangesAsync(ct);
        await trail.PublishAsync(action, ct);

        return AdminMapping.ToResponse(assignment, user);
    }
}

/// <summary>Takes the administrator role and level away and ends the person's panel sessions.</summary>
public sealed record RevokeAdminCommand(
    Guid ActorId,
    string ActorLevel,
    Guid UserId,
    string Reason) : IRequest<Unit>;

public sealed class RevokeAdminCommandHandler(
    IUserRepository users,
    IRoleRepository roles,
    IAdminLevelRepository levels,
    IAdminAuditTrail trail,
    IUnitOfWork unitOfWork)
    : IRequestHandler<RevokeAdminCommand, Unit>
{
    public async Task<Unit> Handle(RevokeAdminCommand command, CancellationToken ct)
    {
        if (command.UserId == command.ActorId)
            throw new DomainException("You cannot remove yourself as an administrator.", "ADMIN_SELF_CHANGE");

        var assignment = await levels.FindAsync(command.UserId, ct)
            ?? throw new DomainException("This account is not an administrator.", "ADMIN_NOT_FOUND");

        if (assignment.Level == AdminLevels.Super
            && await levels.CountAtLevelAsync(AdminLevels.Super, ct) <= 1)
            throw new DomainException("The last super administrator cannot be removed.", "ADMIN_LAST_SUPER");

        // Loads the sessions next to the roles.
        var user = await users.FindByIdWithTokensAsync(command.UserId, ct)
            ?? throw new UserNotFoundException();

        var before = AdminMapping.Snapshot(user.Email, assignment.Level);

        var role = await roles.FindByNameAsync(RoleNames.PlatformAdmin, ct);
        if (role is not null) user.RemoveRole(role.Id);
        user.RevokeRefreshTokens(ClientTypes.Admin);
        levels.Remove(assignment);

        var action = new AdminActionPerformedEvent(
            command.ActorId,
            command.ActorLevel,
            AdminActions.Revoked,
            AdminActions.TargetType,
            user.Id.ToString(),
            command.Reason.Trim(),
            before,
            null);

        trail.Stage(action);
        await unitOfWork.SaveChangesAsync(ct);
        await trail.PublishAsync(action, ct);

        return Unit.Value;
    }
}

/// <summary>Action names and the target type of the administrators' part of the trail.</summary>
public static class AdminActions
{
    public const string TargetType = "admin";
    public const string Granted = "admin.granted";
    public const string LevelChanged = "admin.level_changed";
    public const string Revoked = "admin.revoked";
}

internal static class AdminMapping
{
    public static IReadOnlyDictionary<string, object?> Snapshot(string email, string level) =>
        new Dictionary<string, object?> { ["email"] = email, ["level"] = level };

    public static AdminResponse ToResponse(AdminListItem i) =>
        new(i.UserId, i.Email, i.Level, i.GrantedAt, i.GrantedBy, i.TwoFactorEnabled);

    public static AdminResponse ToResponse(AdminLevelAssignment a, User user) =>
        new(user.Id, user.Email, a.Level, a.GrantedAt, a.GrantedBy, user.TwoFactorEnabled);
}
