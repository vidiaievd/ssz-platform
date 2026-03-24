using AuthService.Application.Interfaces;

namespace AuthService.Infrastructure.Persistence.Repositories;

public sealed class UnitOfWork(AuthDbContext db) : IUnitOfWork
{
    public Task<int> SaveChangesAsync(CancellationToken ct = default) =>
        db.SaveChangesAsync(ct);
}