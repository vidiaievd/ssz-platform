using AuthService.Domain.Events;

namespace AuthService.Application.Services;

/// <summary>
/// Records what an administrator did (plan 90): the trail row joins the caller's transaction,
/// and the <c>admin.action.performed</c> event goes out once that transaction is saved.
/// </summary>
public interface IAdminAuditTrail
{
    /// <summary>Adds the trail row; the caller's next save writes it with the change.</summary>
    void Stage(AdminActionPerformedEvent action);

    /// <summary>
    /// Publishes the event after the save. A broker failure is logged and swallowed: the change
    /// and its trail row are already stored, and refusing the request would only hide that.
    /// </summary>
    Task PublishAsync(AdminActionPerformedEvent action, CancellationToken ct = default);
}
