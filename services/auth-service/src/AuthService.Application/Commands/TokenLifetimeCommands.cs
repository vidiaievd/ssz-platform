using AuthService.Application.DTOs;
using AuthService.Application.Interfaces;
using AuthService.Application.Options;
using AuthService.Application.Services;
using AuthService.Domain.Entities;
using AuthService.Domain.Events;
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
//
// Plan 90: every pair whose lifetime actually changes leaves one admin trail row, written
// with the change; the events go out after the save.

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
    string ActorLevel,
    IReadOnlyList<TokenLifetimeChange> Changes,
    string Reason) : IRequest<TokenLifetimesResponse>;

public sealed class UpdateTokenLifetimesCommandHandler(
    ITokenLifetimePolicyRepository policies,
    IRoleRepository roleRepository,
    IAdminAuditTrail trail,
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
        var reason = command.Reason.Trim();
        var actions = new List<AdminActionPerformedEvent>();

        foreach (var change in command.Changes)
        {
            var role = change.Role.Trim();
            var clientType = change.ClientType.Trim().ToLowerInvariant();
            var policy = existing.FirstOrDefault(p =>
                p.Role == role && p.ClientType == clientType);

            if (policy is not null)
            {
                // Sending the current value is not a change: no row, no new "updated by".
                if (policy.RefreshLifetimeHours == change.RefreshLifetimeHours) continue;

                var before = policy.RefreshLifetimeHours;
                policy.Change(change.RefreshLifetimeHours, command.ActorId, now);
                actions.Add(Action(command, reason, role, clientType, before, change.RefreshLifetimeHours));
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
            actions.Add(Action(command, reason, role, clientType, null, change.RefreshLifetimeHours));
        }

        foreach (var action in actions) trail.Stage(action);
        await unitOfWork.SaveChangesAsync(ct);
        foreach (var action in actions) await trail.PublishAsync(action, ct);

        return TokenLifetimes.ToResponse(existing, authOptions.Value);
    }

    private static AdminActionPerformedEvent Action(
        UpdateTokenLifetimesCommand command,
        string reason,
        string role,
        string clientType,
        int? beforeHours,
        int afterHours) =>
        new(
            command.ActorId,
            command.ActorLevel,
            TokenLifetimeActions.Changed,
            TokenLifetimeActions.TargetType,
            TokenLifetimeActions.TargetId(role, clientType),
            reason,
            // A pair without a row had no lifetime of its own (the fallback applied).
            beforeHours is null ? null : Hours(beforeHours.Value),
            Hours(afterHours));

    private static IReadOnlyDictionary<string, object?> Hours(int hours) =>
        new Dictionary<string, object?> { ["hours"] = hours };
}

/// <summary>Action name and target of the token lifetimes' part of the admin trail.</summary>
public static class TokenLifetimeActions
{
    public const string Changed = "token_lifetime.changed";
    public const string TargetType = "token_lifetime";

    public static string TargetId(string role, string clientType) => $"{role}:{clientType}";
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
