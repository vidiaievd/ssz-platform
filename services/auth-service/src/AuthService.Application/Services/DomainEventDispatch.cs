using AuthService.Application.Interfaces;
using AuthService.Domain.Common;

namespace AuthService.Application.Services;

public static class DomainEventDispatch
{
    /// <summary>
    /// Publishes what the aggregate raised, after the caller saved it, and clears the list. Best
    /// effort like the rest of auth's events: the change is already stored, and the publisher has
    /// logged a broker failure before it throws.
    /// </summary>
    public static async Task PublishAndClearAsync(
        this IDomainEventPublisher publisher,
        AggregateRoot root,
        CancellationToken ct)
    {
        try
        {
            foreach (var domainEvent in root.DomainEvents)
                await publisher.PublishAsync(domainEvent, ct);
        }
        catch
        {
            // swallow — logged by the publisher
        }
        finally
        {
            root.ClearDomainEvents();
        }
    }
}
