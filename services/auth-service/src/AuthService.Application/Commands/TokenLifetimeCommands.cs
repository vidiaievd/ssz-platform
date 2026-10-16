using AuthService.Application.DTOs;
using AuthService.Application.Interfaces;
using AuthService.Application.Options;
using AuthService.Domain.Entities;
using AuthService.Domain.Exceptions;
using MediatR;
using Microsoft.Extensions.Options;

namespace AuthService.Application.Commands;

// ── Refresh-token lifetimes by role and client (ADR-012) ──────────────────────
//
// Read and changed by a platform administrator. A change applies to tokens issued or
// rotated after it; a token already issued keeps the expiry it was given, so lowering a
// lifetime ends long sessions at their next refresh rather than at once. Revoking them
// now is what "revoke all sessions" is for.

public sealed record ListTokenLifetimesQuery : IRequest<TokenLifetimesResponse>;

public sealed class ListTokenLifetimesQueryHandler(
    ITokenLifetimePolicyRepository policies,
    IOptions<AuthOptions> authOptions)
    : IRequestHandler<ListTokenLifetimesQuery, TokenLifetimesResponse>
{
    public async Task<TokenLifetimesResponse> Handle(
        ListTokenLifetimesQuery query,
        CancellationToken ct) =>
        TokenLifetimes.ToResponse(await policies.ListAsync(ct), authOptions.Value);
}

public sealed record UpdateTokenLifetimesCommand(
    Guid ActorId,
    IReadOnlyList<TokenLifetimeChange> Changes) : IRequest<TokenLifetimesResponse>;

public sealed class UpdateTokenLifetimesCommandHandler(
    ITokenLifetimePolicyRepository policies,
    IRoleRepository roleRepository,
    IUnitOfWork unitOfWork,
    IOptions<AuthOptions> authOptions)
    : IRequestHandler<UpdateTokenLifetimesCommand, TokenLifetimesResponse>
{
    public async Task<TokenLifetimesResponse> Handle(
        UpdateTokenLifetimesCommand command,
        CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        var existing = await policies.ListAsync(ct);

        foreach (var change in command.Changes)
        {
            var role = change.Role.Trim();
            var clientType = change.ClientType.Trim().ToLowerInvariant();
            var policy = existing.FirstOrDefault(p =>
                p.Role == role && p.ClientType == clientType);

            if (policy is not null)
            {
                policy.Change(change.RefreshLifetimeHours, command.ActorId, now);
                continue;
            }

            // A role created after the defaults were seeded has no row yet: it gets one, as
            // long as the role exists — a typo must not become a policy nobody holds.
            if (await roleRepository.FindByNameAsync(role, ct) is null)
                throw new DomainException(
                    $"Role '{role}' does not exist.", "TOKEN_LIFETIME_UNKNOWN_ROLE");

            var created = TokenLifetimePolicy.Create(
                role, clientType, change.RefreshLifetimeHours, now, command.ActorId);
            policies.Add(created);
            existing.Add(created);
        }

        await unitOfWork.SaveChangesAsync(ct);
        return TokenLifetimes.ToResponse(existing, authOptions.Value);
    }
}

internal static class TokenLifetimes
{
    public static TokenLifetimesResponse ToResponse(
        IEnumerable<TokenLifetimePolicy> policies,
        AuthOptions options) =>
        new(
            policies
                .OrderBy(p => p.Role, StringComparer.Ordinal)
                .ThenBy(p => p.ClientType, StringComparer.Ordinal)
                .Select(p => new TokenLifetimeDto(
                    p.Role, p.ClientType, p.RefreshLifetimeHours, p.UpdatedAt, p.UpdatedBy))
                .ToList(),
            (int)options.RefreshTokenLifetime.TotalHours,
            TokenLifetimePolicy.MinHours,
            TokenLifetimePolicy.MaxHours);
}
