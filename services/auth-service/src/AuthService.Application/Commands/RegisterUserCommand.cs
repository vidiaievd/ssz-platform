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

        // Build the role list before creating the user — passed into the domain event
        var roleNames = new List<string> { "student" };
        if (role == "tutor")
            roleNames.Add("tutor");

        var user = User.Create(email, passwordHash, roleNames.AsReadOnly());

        // Every user can learn — always assign Student role
        var studentRole = await roleRepository.FindByNameAsync("Student", ct)
            ?? throw new DomainException("Role 'Student' not found.", "ROLE_NOT_FOUND");
        user.AssignRole(studentRole);

        // If registering as a tutor, additionally assign the Tutor role
        if (role == "tutor")
        {
            var tutorRole = await roleRepository.FindByNameAsync("Tutor", ct)
                ?? throw new DomainException("Role 'Tutor' not found.", "ROLE_NOT_FOUND");
            user.AssignRole(tutorRole);
        }

        userRepository.Add(user);

        await unitOfWork.SaveChangesAsync(ct);

        foreach (var domainEvent in user.DomainEvents)
            await eventPublisher.PublishAsync(domainEvent, ct);

        user.ClearDomainEvents();

        return new RegisterResponse(user.Id, user.Email);
    }
}