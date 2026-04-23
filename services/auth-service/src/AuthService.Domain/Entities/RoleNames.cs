namespace AuthService.Domain.Entities;

public static class RoleNames
{
    public const string Student         = "student";
    public const string Tutor           = "tutor";
    public const string PlatformAdmin   = "platform_admin";
    public const string ManagerPlatform = "manager_platform";
    public const string Premium         = "premium";

    public static readonly IReadOnlySet<string> SelfAssignable =
        new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            Student,
            Tutor,
        };
}
