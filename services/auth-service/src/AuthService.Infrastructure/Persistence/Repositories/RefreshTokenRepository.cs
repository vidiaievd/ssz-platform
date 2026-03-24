using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace AuthService.Infrastructure.Persistence.Repositories;

public sealed class RefreshTokenRepository(AuthDbContext db) : IRefreshTokenRepository
{
    public async Task<RefreshToken?> FindActiveByHashAsync(
        string tokenHash,
        CancellationToken ct = default) =>
        await db.RefreshTokens
            .FirstOrDefaultAsync(rt => rt.TokenHash == tokenHash, ct);
}