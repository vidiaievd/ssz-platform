using AuthService.Domain.Events;

namespace AuthService.Domain.Entities;

/// <summary>
/// One change an administrator made (plan 90): who, at which level, what, to which object and
/// why, with the object before and after. Written in the same transaction as the change and
/// never edited. Deliberately no foreign key to users: the trail outlives the accounts in it.
/// </summary>
public sealed class AdminAuditEntry
{
    private AdminAuditEntry() { }

    /// <summary>The id of the <c>admin.action.performed</c> event, so a consumer can deduplicate.</summary>
    public Guid Id { get; private set; }
    public DateTimeOffset OccurredAt { get; private set; }

    /// <summary>Null when the change came from the command line (<c>admin bootstrap</c>).</summary>
    public Guid? ActorId { get; private set; }
    public string? ActorLevel { get; private set; }

    public string Action { get; private set; } = default!;
    public string TargetType { get; private set; } = default!;
    public string TargetId { get; private set; } = default!;
    public string? Reason { get; private set; }

    /// <summary>JSON of the object before the change; null when it did not exist.</summary>
    public string? BeforeJson { get; private set; }

    /// <summary>JSON of the object after the change; null when it no longer exists.</summary>
    public string? AfterJson { get; private set; }

    public static AdminAuditEntry From(AdminActionPerformedEvent e) => new()
    {
        Id = e.EventId,
        OccurredAt = e.OccurredAt,
        ActorId = e.ActorId,
        ActorLevel = e.ActorLevel,
        Action = e.Action,
        TargetType = e.TargetType,
        TargetId = e.TargetId,
        Reason = e.Reason,
        BeforeJson = e.Before is null ? null : System.Text.Json.JsonSerializer.Serialize(e.Before),
        AfterJson = e.After is null ? null : System.Text.Json.JsonSerializer.Serialize(e.After),
    };
}
