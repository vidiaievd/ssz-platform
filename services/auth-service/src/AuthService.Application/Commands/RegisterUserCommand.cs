using AuthService.Application.DTOs;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using AuthService.Domain.Exceptions;
using MediatR;

namespace AuthService.Application.Commands;

public sealed record RegisterUserCommand(
    string Email,
    string Password,
    string Role = "student") : IRequest<RegisterResponse>;

public sealed class RegisterUserCommandHandler(
    IUserRepository userRepository,
    IRoleRepository roleRepository,
    IPasswordHasher passwordHasher,
    IDomainEventPublisher eventPublisher,
    IUnitOfWork unitOfWork)
    : IRequestHandler<RegisterUserCommand, RegisterResponse>
{
    public async Task<RegisterResponse> Handle(
        RegisterUserCommand command,
        CancellationToken ct)
    {
        var email = command.Email.Trim().ToLowerInvariant();

        if (await userRepository.ExistsByEmailAsync(email, ct))
            throw new UserAlreadyExistsException();

        var passwordHash = passwordHasher.Hash(command.Password);
        var requestedRole = command.Role.Trim().ToLowerInvariant();

        // Student is always present — every registered user can learn (ROLES.md)
        // Tutor is additionally assigned when explicitly registering as tutor
        var roleNames = requestedRole == "tutor"
            ? new[] { "Student", "Tutor" }
            : new[] { "Student" };

        var eventRoles = roleNames
            .Select(r => r.ToLowerInvariant())
            .ToArray()
            .AsReadOnly() as IReadOnlyList<string>;

        var user = User.Create(email, passwordHash, eventRoles!);

        foreach (var roleName in roleNames)
        {
            var role = await roleRepository.FindByNameAsync(roleName, ct)
                ?? throw new DomainException(
                    $"Role '{roleName}' not found.",
                    "ROLE_NOT_FOUND");
            user.AssignRole(role);
        }

        userRepository.Add(user);
        await unitOfWork.SaveChangesAsync(ct);

        foreach (var domainEvent in user.DomainEvents)
            await eventPublisher.PublishAsync(domainEvent, ct);

        user.ClearDomainEvents();

        return new RegisterResponse(user.Id, user.Email);
    }
}
