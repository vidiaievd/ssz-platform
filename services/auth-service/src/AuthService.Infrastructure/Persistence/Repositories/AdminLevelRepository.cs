using AuthService.Application.Interfaces;
using AuthService.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace AuthService.Infrastructure.Persistence.Repositories;

public sealed class AdminLevelRepository(AuthDbContext db) : IAdminLevelRepository
{
    public async Task<AdminLevelAssignment?> FindAsync(Guid userId, CancellationToken ct = default) =>
        await db.AdminLevels.FirstOrDefaultAsync(a => a.UserId == userId, ct);

    public void Add(AdminLevelAssignment assignment) => db.AdminLevels.Add(assignment);
}
