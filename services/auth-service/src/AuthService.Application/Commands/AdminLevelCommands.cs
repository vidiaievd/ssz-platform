using AuthService.Application.Interfaces;
using AuthService.Application.Services;
using AuthService.Domain.Entities;
using AuthService.Domain.Events;
using AuthService.Domain.Exceptions;
using MediatR;

namespace AuthService.Application.Commands;

// ── Bootstrap a super administrator ───────────────────────────────────────────

/// <summary>
/// Makes an existing account a platform administrator with the <c>super</c> level (plan 90).
/// Run from the command line only (<c>admin bootstrap &lt;email&gt;</c>): it is how the first
/// super appears, and how one is recovered if none is left. Idempotent.
/// </summary>
public sealed record BootstrapSuperAdminCommand(string Email) : IRequest<BootstrapSuperAdminResult>;

/// <param name="Changed">False when the account already was a super administrator.</param>
public sealed record BootstrapSuperAdminResult(Guid UserId, string Email, bool Changed);

public sealed class BootstrapSuperAdminCommandHandler(
    IUserRepository userRepository,
    IRoleRepository roleRepository,
    IAdminLevelRepository adminLevels,
    IAdminAuditTrail trail,
    IUnitOfWork unitOfWork)
    : IRequestHandler<BootstrapSuperAdminCommand, BootstrapSuperAdminResult>
{
    public async Task<BootstrapSuperAdminResult> Handle(
        BootstrapSuperAdminCommand command,
        CancellationToken ct)
    {
        var user = await userRepository.FindByEmailAsync(command.Email.Trim().ToLowerInvariant(), ct)
            ?? throw new UserNotFoundException();

        var role = await roleRepository.FindByNameAsync(RoleNames.PlatformAdmin, ct)
            ?? throw new DomainException(
                $"Role '{RoleNames.PlatformAdmin}' not found.", "ROLE_NOT_FOUND");

        var hadRole = user.Roles.Any(r => r.RoleId == role.Id);
        user.AssignRole(role);

        var now = DateTimeOffset.UtcNow;
        var assignment = await adminLevels.FindAsync(user.Id, ct);
        var hadSuper = assignment?.Level == AdminLevels.Super;
        var levelBefore = assignment?.Level;

        if (assignment is null)
            adminLevels.Add(AdminLevelAssignment.Create(user.Id, AdminLevels.Super, now));
        else if (!hadSuper)
            assignment.ChangeTo(AdminLevels.Super, now);

        var changed = !hadRole || !hadSuper;
        if (!changed)
            return new BootstrapSuperAdminResult(user.Id, user.Email, false);

        // No actor: the command line is the authority, and the trail says so.
        var action = new AdminActionPerformedEvent(
            null,
            null,
            levelBefore is null ? AdminActions.Granted : AdminActions.LevelChanged,
            AdminActions.TargetType,
            user.Id.ToString(),
            "admin bootstrap (command line)",
            levelBefore is null ? null : AdminMapping.Snapshot(user.Email, levelBefore),
            AdminMapping.Snapshot(user.Email, AdminLevels.Super));

        trail.Stage(action);
        await unitOfWork.SaveChangesAsync(ct);
        await trail.PublishAsync(action, ct);

        return new BootstrapSuperAdminResult(user.Id, user.Email, changed);
    }
}
