using AuthService.Application.DTOs;
using AuthService.Application.Interfaces;
using AuthService.Application.Options;
using AuthService.Domain.Exceptions;
using MediatR;
using Microsoft.Extensions.Options;

namespace AuthService.Application.Commands;

// ── Account deletion with a grace period ──────────────────────────────────────
//
// The user asks with their password; every session ends at once, but nothing is erased and
// no other service hears about it. Signing in within the grace period cancels the request.
// After it, the purge publishes auth.user.deleted first and only then erases the user, so a
// failed publish leaves the row for the next run instead of an account nobody else forgets.

public sealed record RequestAccountDeletionCommand(
    Guid UserId,
    string Password) : IRequest<AccountDeletionResponse>;

public sealed class RequestAccountDeletionCommandHandler(
    IUserRepository userRepository,
    IRoleRepository roleRepository,
    IPasswordHasher passwordHasher,
    IDomainEventPublisher eventPublisher,
    IUnitOfWork unitOfWork,
    IOptions<AuthOptions> authOptions)
    : IRequestHandler<RequestAccountDeletionCommand, AccountDeletionResponse>
{
    public async Task<AccountDeletionResponse> Handle(
        RequestAccountDeletionCommand command,
        CancellationToken ct)
    {
        var opts = authOptions.Value;
        var user = await userRepository.FindByIdWithTokensAsync(command.UserId, ct)
            ?? throw new UserNotFoundException();

        user.UnlockIfExpired();
        if (user.IsCurrentlyLocked())
            throw new AccountLockedException(user.LockedUntil);

        // Wrong guesses count towards the same lockout as sign-in: a stolen session must not
        // become a way to try passwords.
        if (!passwordHasher.Verify(command.Password, user.PasswordHash))
        {
            user.RecordFailedLogin(opts.MaxFailedLoginAttempts, opts.LockoutDuration);
            await unitOfWork.SaveChangesAsync(ct);
            throw new PasswordMismatchException();
        }

        var roles = await roleRepository.GetRoleNamesForUserAsync(user.Id, ct);
        user.RequestDeletion(roles);
        await unitOfWork.SaveChangesAsync(ct);

        foreach (var evt in user.DomainEvents)
            await eventPublisher.PublishAsync(evt, ct);
        user.ClearDomainEvents();

        var requestedAt = user.DeletionRequestedAt!.Value;
        return new AccountDeletionResponse(requestedAt, requestedAt.Add(opts.AccountDeletionGrace));
    }
}

/// <summary>Accounts whose grace period is over, oldest request first.</summary>
public sealed record ListAccountsDueForPurgeQuery(int Limit = 100) : IRequest<List<Guid>>;

public sealed class ListAccountsDueForPurgeQueryHandler(
    IUserRepository userRepository,
    IOptions<AuthOptions> authOptions)
    : IRequestHandler<ListAccountsDueForPurgeQuery, List<Guid>>
{
    public Task<List<Guid>> Handle(ListAccountsDueForPurgeQuery query, CancellationToken ct) =>
        userRepository.ListDueForPurgeAsync(
            DateTimeOffset.UtcNow.Subtract(authOptions.Value.AccountDeletionGrace),
            query.Limit,
            ct);
}

/// <summary>Erases one account; false when there was nothing (left) to erase.</summary>
public sealed record PurgeAccountCommand(Guid UserId) : IRequest<bool>;

public sealed class PurgeAccountCommandHandler(
    IUserRepository userRepository,
    IDomainEventPublisher eventPublisher,
    IUnitOfWork unitOfWork,
    IOptions<AuthOptions> authOptions)
    : IRequestHandler<PurgeAccountCommand, bool>
{
    public async Task<bool> Handle(PurgeAccountCommand command, CancellationToken ct)
    {
        // Loaded with everything that goes with it, so the change tracker removes it all.
        var user = await userRepository.FindByIdWithBackupCodesAsync(command.UserId, ct);
        if (user is null) return false;

        // Re-checked here: the user may have signed in since the list was read.
        var cutoff = DateTimeOffset.UtcNow.Subtract(authOptions.Value.AccountDeletionGrace);
        if (user.DeletionRequestedAt is null || user.DeletionRequestedAt > cutoff) return false;

        user.MarkPurged();

        // Publish first: if it throws, the row stays and the next run tries again. A publish
        // that succeeds before a failed delete is repeated next time — erasing twice is harmless.
        foreach (var evt in user.DomainEvents)
            await eventPublisher.PublishAsync(evt, ct);
        user.ClearDomainEvents();

        userRepository.Remove(user);
        await unitOfWork.SaveChangesAsync(ct);
        return true;
    }
}
