namespace AuthService.Application.Options;

public sealed class AuthOptions
{
    public const string SectionName = "Auth";

    public string Issuer { get; set; } = default!;
    public string Audience { get; set; } = default!;
    public string PrivateKeyPath { get; set; } = default!;
    public string PublicKeyPath { get; set; } = default!;
    public string MfaChallengeSecret { get; set; } = default!;
    public string EncryptionKey { get; set; } = default!;
    public string TotpIssuer { get; set; } = default!;

    public int AccessTokenLifetimeMinutes { get; set; } = 15;
    public int RefreshTokenLifetimeDays { get; set; } = 7;
    public int MfaChallengeLifetimeMinutes { get; set; } = 5;
    public int MaxFailedLoginAttempts { get; set; } = 5;
    public int LockoutDurationMinutes { get; set; } = 15;

    public TimeSpan AccessTokenLifetime =>
        TimeSpan.FromMinutes(AccessTokenLifetimeMinutes);
    public TimeSpan RefreshTokenLifetime =>
        TimeSpan.FromDays(RefreshTokenLifetimeDays);
    public TimeSpan LockoutDuration =>
        TimeSpan.FromMinutes(LockoutDurationMinutes);
    public TimeSpan MfaChallengeLifetime =>
        TimeSpan.FromMinutes(MfaChallengeLifetimeMinutes);
}