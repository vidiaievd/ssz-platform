using AuthService.Application.Interfaces;
using AuthService.Application.Options;
using AuthService.Domain.Entities;
using Microsoft.Extensions.Options;

namespace AuthService.Application.Services;

/// <summary>How long a refresh token issued now lives for this user on this client (ADR-012).</summary>
public interface IRefreshTokenLifetimeResolver
{
    Task<TimeSpan> ResolveAsync(
        IReadOnlyCollection<string> roles,
        string clientType,
        CancellationToken ct = default);
}

/// <summary>
/// The shortest lifetime among the user's roles on the client: an account is bounded by its
/// most privileged role, so a platform administrator who also studies does not keep a
/// student's month-long session. Read on every issue and every rotation, so a role granted
/// or withdrawn, or a policy changed, applies from the next refresh.
///
/// A user none of whose roles has a policy gets <see cref="AuthOptions.RefreshTokenLifetime"/>,
/// the lifetime every token had before policies existed.
/// </summary>
public sealed class RefreshTokenLifetimeResolver(
    ITokenLifetimePolicyRepository policies,
    IOptions<AuthOptions> authOptions) : IRefreshTokenLifetimeResolver
{
    public async Task<TimeSpan> ResolveAsync(
        IReadOnlyCollection<string> roles,
        string clientType,
        CancellationToken ct = default)
    {
        var matching = roles.Count == 0
            ? []
            : await policies.ListForAsync(roles, ClientTypes.Normalize(clientType), ct);

        return matching.Count == 0
            ? authOptions.Value.RefreshTokenLifetime
            : matching.Min(p => p.RefreshLifetime);
    }
}
