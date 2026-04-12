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

        var role = command.Role.Trim().ToLowerInvariant();

        var user = User.Create(email, passwordHash, new[] { role }.AsReadOnly());

        // Assign exactly the role the user registered with
        var roleName = role switch
        {
            "tutor" => "Tutor",
            _ => "Student",
        };
        var assignedRole = await roleRepository.FindByNameAsync(roleName, ct)
            ?? throw new DomainException($"Role '{roleName}' not found.", "ROLE_NOT_FOUND");
        user.AssignRole(assignedRole);

        userRepository.Add(user);

        await unitOfWork.SaveChangesAsync(ct);

        foreach (var domainEvent in user.DomainEvents)
            await eventPublisher.PublishAsync(domainEvent, ct);

        user.ClearDomainEvents();

        return new RegisterResponse(user.Id, user.Email);
    }
}