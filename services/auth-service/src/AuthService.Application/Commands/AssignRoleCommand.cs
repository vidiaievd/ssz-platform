using AuthService.Application.Interfaces;
using AuthService.Domain.Exceptions;
using MediatR;

namespace AuthService.Application.Commands;

public sealed record AssignRoleCommand(
    Guid UserId,
    string RoleName,
    bool ActorIsAdmin = false
) : IRequest<Unit>;

public sealed class AssignRoleCommandHandler(
    IUserRepository userRepository,
    IRoleRepository roleRepository,
    IUnitOfWork unitOfWork)
    : IRequestHandler<AssignRoleCommand, Unit>
{
    // Roles that any user can assign to themselves
    private static readonly HashSet<string> SelfAssignableRoles =
        new(StringComparer.OrdinalIgnoreCase) { "Student", "Tutor" };

    public async Task<Unit> Handle(AssignRoleCommand command, CancellationToken ct)
    {
        var roleName = command.RoleName.Trim();

        // Only admins can assign privileged roles
        if (!SelfAssignableRoles.Contains(roleName) && !command.ActorIsAdmin)
            throw new DomainException(
                $"Role '{roleName}' can only be assigned by an administrator.",
                "FORBIDDEN");

        var user = await userRepository.FindByIdWithRolesAsync(command.UserId, ct)
            ?? throw new DomainException(
                $"User '{command.UserId}' not found.",
                "USER_NOT_FOUND");

        var role = await roleRepository.FindByNameAsync(roleName, ct)
            ?? throw new DomainException(
                $"Role '{roleName}' not found.",
                "ROLE_NOT_FOUND");

        // AssignRole is idempotent — duplicate check is inside the domain entity
        user.AssignRole(role);

        await unitOfWork.SaveChangesAsync(ct);

        return Unit.Value;
    }
}
