using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using AuthService.Domain.Exceptions;

namespace AuthService.Application.Services;

/// <summary>
/// Who may hold an admin-panel session (plan 90): a platform administrator with an admin level
/// and MFA turned on. Asked when the session is opened and again on every refresh, so a
/// withdrawn role, level or MFA ends the session at its next refresh.
/// </summary>
public interface IAdminSessionGate
{
    /// <summary>A platform administrator with a level, MFA or not — for setting MFA up.</summary>
    /// <returns>The user's admin level.</returns>
    /// <exception cref="AdminAccessDeniedException">Not a platform administrator with a level.</exception>
    Task<string> RequireLevelAsync(
        User user,
        IReadOnlyCollection<string> roles,
        CancellationToken ct = default);

    /// <returns>The user's admin level, for the access token.</returns>
    /// <exception cref="AdminAccessDeniedException">Not a platform administrator with a level.</exception>
    /// <exception cref="MfaSetupRequiredException">An administrator without MFA.</exception>
    Task<string> AdmitAsync(
        User user,
        IReadOnlyCollection<string> roles,
        CancellationToken ct = default);
}

public sealed class AdminSessionGate(IAdminLevelRepository levels) : IAdminSessionGate
{
    public async Task<string> AdmitAsync(
        User user,
        IReadOnlyCollection<string> roles,
        CancellationToken ct = default)
    {
        var level = await RequireLevelAsync(user, roles, ct);

        // Checked after the role and level, so a non-administrator learns nothing about MFA.
        if (!user.TwoFactorEnabled)
            throw new MfaSetupRequiredException();

        return level;
    }

    public async Task<string> RequireLevelAsync(
        User user,
        IReadOnlyCollection<string> roles,
        CancellationToken ct = default)
    {
        if (!roles.Contains(RoleNames.PlatformAdmin))
            throw new AdminAccessDeniedException();

        var assignment = await levels.FindAsync(user.Id, ct);
        if (assignment is null || !AdminLevels.IsKnown(assignment.Level))
            throw new AdminAccessDeniedException();

        return assignment.Level;
    }
}
