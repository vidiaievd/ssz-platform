namespace AuthService.Domain.Entities;

/// <summary>
/// What kind of client a session was opened from (ADR-012). Decides, together with the
/// user's roles, how long its refresh token lives: a phone has to survive weeks offline,
/// a browser does not.
/// </summary>
public static class ClientTypes
{
    public const string Web    = "web";
    public const string Mobile = "mobile";

    public static readonly IReadOnlySet<string> All =
        new HashSet<string>(StringComparer.Ordinal) { Web, Mobile };

    /// <summary>The client named, or <see cref="Web"/> when it named none or an unknown one.</summary>
    public static string Normalize(string? clientType) =>
        clientType is not null && All.Contains(clientType.Trim().ToLowerInvariant())
            ? clientType.Trim().ToLowerInvariant()
            : Web;
}
