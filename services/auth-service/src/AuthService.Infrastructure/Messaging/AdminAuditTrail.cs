using AuthService.Application.Interfaces;
using AuthService.Application.Services;
using AuthService.Domain.Entities;
using AuthService.Domain.Events;
using Microsoft.Extensions.Logging;

namespace AuthService.Infrastructure.Messaging;

public sealed class AdminAuditTrail(
    IAdminAuditRepository entries,
    IDomainEventPublisher publisher,
    ILogger<AdminAuditTrail> logger) : IAdminAuditTrail
{
    public void Stage(AdminActionPerformedEvent action) => entries.Add(AdminAuditEntry.From(action));

    public async Task PublishAsync(AdminActionPerformedEvent action, CancellationToken ct = default)
    {
        try
        {
            await publisher.PublishAsync(action, ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex,
                "The admin trail row {EventId} ({Action}) is stored but its event was not published",
                action.EventId, action.Action);
        }
    }
}
