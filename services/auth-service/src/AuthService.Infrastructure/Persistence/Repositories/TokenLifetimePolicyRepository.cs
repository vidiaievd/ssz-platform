using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace AuthService.Infrastructure.Persistence.Repositories;

public sealed class TokenLifetimePolicyRepository(AuthDbContext db) : ITokenLifetimePolicyRepository
{
    public async Task<List<TokenLifetimePolicy>> ListAsync(CancellationToken ct = default) =>
        await db.TokenLifetimePolicies.ToListAsync(ct);

    public async Task<List<TokenLifetimePolicy>> ListForAsync(
        IReadOnlyCollection<string> roles,
        string clientType,
        CancellationToken ct = default) =>
        await db.TokenLifetimePolicies
            .Where(p => p.ClientType == clientType && roles.Contains(p.Role))
            .ToListAsync(ct);

    public void Add(TokenLifetimePolicy policy) => db.TokenLifetimePolicies.Add(policy);
}
