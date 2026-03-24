using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace AuthService.Infrastructure.Persistence.Repositories;

public sealed class RoleRepository(AuthDbContext db) : IRoleRepository
{
    public async Task<Role?> FindByNameAsync(string name, CancellationToken ct = default) =>
        await db.Roles
            .FirstOrDefaultAsync(r => r.NormalizedName == name.ToUpperInvariant(), ct);

    public async Task<List<string>> GetRoleNamesForUserAsync(
        Guid userId,
        CancellationToken ct = default) =>
        await db.UserRoles
            .Where(ur => ur.UserId == userId)
            .Select(ur => ur.Role.Name)
            .ToListAsync(ct);
}