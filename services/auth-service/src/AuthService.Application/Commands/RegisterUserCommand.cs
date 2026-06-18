using AuthService.Application.DTOs;
using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using AuthService.Domain.Exceptions;
using MediatR;
using Microsoft.Extensions.DependencyInjection;

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
    IUnitOfWork unitOfWork,
    IServiceScopeFactory scopeFactory)
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

        // student      → [student]
        // tutor        → [tutor]
        // school_admin → [school_admin]
        // teacher      → [teacher]
        var roleNames = requestedRole switch
        {
            RoleNames.Tutor        => new[] { RoleNames.Tutor },
            RoleNames.SchoolAdmin  => new[] { RoleNames.SchoolAdmin },
            RoleNames.Teacher      => new[] { RoleNames.Teacher },
            _                      => new[] { RoleNames.Student },
        };

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

        // Publishing is best-effort: user is already persisted.
        // A transient broker failure must not roll back a successful registration.
        // The publisher already logs the error before rethrowing.
        // TODO: replace with outbox pattern for guaranteed delivery.
        try
        {
            foreach (var domainEvent in user.DomainEvents)
                await eventPublisher.PublishAsync(domainEvent, ct);
        }
        catch
        {
            // swallow — error already logged by RabbitMqEventPublisher
        }
        finally
        {
            user.ClearDomainEvents();
        }

        // Fire-and-forget in a new DI scope so that the HTTP request scope disposal
        // does not cause ObjectDisposedException on repository/mediator dependencies.
        var userId = user.Id;
        var registrationRole = command.Role;
        _ = Task.Run(async () =>
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var sender = scope.ServiceProvider.GetRequiredService<ISender>();
            await sender.Send(new RequestEmailVerificationCommand(userId, registrationRole));
        });

        return new RegisterResponse(user.Id, user.Email);
    }
}
