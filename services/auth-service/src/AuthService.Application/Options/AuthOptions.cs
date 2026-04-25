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
    public int PasswordResetTokenLifetimeMinutes { get; set; } = 30;
    public int EmailVerificationTokenLifetimeMinutes { get; set; } = 1440;
    public string AppBaseUrl { get; set; } = "http://localhost:3000";
    public int LoginRateLimitMaxAttempts { get; set; } = 10;
    public int LoginRateLimitWindowSeconds { get; set; } = 300;

    public TimeSpan AccessTokenLifetime =>
        TimeSpan.FromMinutes(AccessTokenLifetimeMinutes);
    public TimeSpan RefreshTokenLifetime =>
        TimeSpan.FromDays(RefreshTokenLifetimeDays);
    public TimeSpan LockoutDuration =>
        TimeSpan.FromMinutes(LockoutDurationMinutes);
    public TimeSpan MfaChallengeLifetime =>
        TimeSpan.FromMinutes(MfaChallengeLifetimeMinutes);
    public TimeSpan PasswordResetTokenLifetime =>
        TimeSpan.FromMinutes(PasswordResetTokenLifetimeMinutes);
    public TimeSpan EmailVerificationTokenLifetime =>
        TimeSpan.FromMinutes(EmailVerificationTokenLifetimeMinutes);
    public TimeSpan LoginRateLimitWindow =>
        TimeSpan.FromSeconds(LoginRateLimitWindowSeconds);
}