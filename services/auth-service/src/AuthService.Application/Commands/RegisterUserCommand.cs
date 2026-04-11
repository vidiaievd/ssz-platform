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
        var user = User.Create(email, passwordHash, role);

        var roleName = role switch
        {
            "tutor" => "Tutor",
            "student" => "Student",
            _ => "Student",
        };
        var defaultRole = await roleRepository.FindByNameAsync(roleName, ct)
            ?? await roleRepository.FindByNameAsync("Student", ct)
            ?? await roleRepository.FindByNameAsync("User", ct);
        if (defaultRole is not null)
            user.AssignRole(defaultRole);

        userRepository.Add(user);

        await unitOfWork.SaveChangesAsync(ct);

        foreach (var domainEvent in user.DomainEvents)
            await eventPublisher.PublishAsync(domainEvent, ct);

        user.ClearDomainEvents();

        return new RegisterResponse(user.Id, user.Email);
    }
}