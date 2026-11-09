namespace AuthService.Domain.Entities;

/// <summary>
/// What a platform administrator may do in the admin panel (plan 90). Strictly nested:
/// support ⊂ admin ⊂ super, so a route names the lowest level it admits.
///
/// The level is carried by the access token as the <c>admin_level</c> claim, and only on a
/// session of the <see cref="ClientTypes.Admin"/> client — which is opened through MFA alone.
/// </summary>
public static class AdminLevels
{
    public const string Support = "support";
    public const string Admin   = "admin";
    public const string Super   = "super";

    /// <summary>Lowest first.</summary>
    public static readonly IReadOnlyList<string> All = [Support, Admin, Super];

    public static bool IsKnown(string? level) => level is not null && All.Contains(level);

    /// <summary>True when <paramref name="level"/> is <paramref name="required"/> or above it.</summary>
    public static bool AtLeast(string? level, string required)
    {
        if (!IsKnown(level) || !IsKnown(required)) return false;
        return Rank(level!) >= Rank(required);
    }

    private static int Rank(string level) => level switch
    {
        Support => 1,
        Admin   => 2,
        Super   => 3,
        _       => 0,
    };
}
