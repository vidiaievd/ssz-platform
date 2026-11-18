namespace AuthService.Application.DTOs;

public sealed record RegisterRequest(
    string Email,
    string Password,
    string Role = "student");

public sealed record LoginRequest(
    string Email,
    string Password,
    /// <summary>`web` (default), `mobile` or `admin` (admin panel, plan 90) — decides the refresh-token lifetime (ADR-012).</summary>
    string? ClientType = null);

public sealed record MfaChallengeRequest(
    string MfaChallengeToken,
    string Code,
    /// <summary>`web` (default), `mobile` or `admin` (admin panel, plan 90) — decides the refresh-token lifetime (ADR-012).</summary>
    string? ClientType = null);

public sealed record BackupCodeLoginRequest(
    string MfaChallengeToken,
    string BackupCode,
    /// <summary>`web` (default), `mobile` or `admin` (admin panel, plan 90) — decides the refresh-token lifetime (ADR-012).</summary>
    string? ClientType = null);

public sealed record RefreshTokenRequest(
    string RefreshToken);

public sealed record TotpVerifyRequest(
    string Code);

public sealed record RegisterResponse(
    Guid UserId,
    string Email);

public sealed record AuthTokensResponse(
    string AccessToken,
    string RefreshToken,
    DateTimeOffset AccessTokenExpiresAt,
    DateTimeOffset RefreshTokenExpiresAt,
    /// <summary>True when this sign-in cancelled a pending account deletion — the app says so.</summary>
    bool DeletionCancelled = false);

public sealed record MfaChallengeResponse(
    string MfaChallengeToken,
    DateTimeOffset ExpiresAt);

public sealed record TotpSetupResponse(
    string SecretKey,
    string QrCodeUri,
    byte[] QrCodeImage);

public sealed record Enable2FAResponse(
    string[] BackupCodes);

public sealed record AssignRoleRequest(
    string RoleName);

public sealed record UserRolesResponse(
    string[] Roles);

public sealed record CurrentUserResponse(
    Guid UserId,
    string Email,
    string[] Roles,
    bool EmailVerified);

public sealed record ForgotPasswordRequest(
    string Email);

public sealed record ResetPasswordRequest(
    string Token,
    string NewPassword);

public sealed record VerifyEmailRequest(
    string Token);

public sealed record DeleteAccountRequest(
    string Password);

public sealed record AccountDeletionResponse(
    DateTimeOffset DeletionRequestedAt,
    /// <summary>From this instant the account may be erased; signing in before it cancels.</summary>
    DateTimeOffset PurgeAfter);
// ── Refresh-token lifetimes by role and client (ADR-012) ──────────────────────

public sealed record TokenLifetimeDto(
    string Role,
    string ClientType,
    int RefreshLifetimeHours,
    DateTimeOffset UpdatedAt,
    Guid? UpdatedBy);

public sealed record TokenLifetimesResponse(
    IReadOnlyList<TokenLifetimeDto> Policies,
    /// <summary>The lifetime of a user none of whose roles has a policy.</summary>
    int FallbackHours,
    int MinHours,
    int MaxHours);

public sealed record TokenLifetimeChange(
    string Role,
    string ClientType,
    int RefreshLifetimeHours);

public sealed record UpdateTokenLifetimesRequest(
    IReadOnlyList<TokenLifetimeChange> Policies,
    /// <summary>Why the lifetimes change (plan 90): required, at most 500 characters.</summary>
    string Reason);

// ── Admin panel session (plan 90) ─────────────────────────────────────────────

/// <param name="MfaSetupToken">Lets the administrator set MFA up, and nothing else.</param>
public sealed record MfaSetupChallengeResponse(
    string MfaSetupToken,
    DateTimeOffset ExpiresAt);

public sealed record AdminLoginRequest(
    string Email,
    string Password);

public sealed record AdminMfaRequest(
    string MfaChallengeToken,
    string Code);

public sealed record AdminBackupCodeRequest(
    string MfaChallengeToken,
    string BackupCode);

public sealed record AdminMfaSetupRequest(
    string MfaSetupToken);

public sealed record AdminMfaSetupConfirmRequest(
    string MfaSetupToken,
    string Code);

/// <summary>
/// An admin-panel session. The refresh token is not here: it lives only in an httpOnly cookie
/// scoped to <c>/api/v1/auth/admin/session</c>.
/// </summary>
public sealed record AdminSessionResponse(
    string AccessToken,
    DateTimeOffset AccessTokenExpiresAt,
    DateTimeOffset SessionExpiresAt);

/// <param name="BackupCodes">Shown once; the panel must make the administrator keep them.</param>
public sealed record AdminMfaSetupConfirmedResponse(
    string[] BackupCodes,
    string AccessToken,
    DateTimeOffset AccessTokenExpiresAt,
    DateTimeOffset SessionExpiresAt);


// ── Administrators (plan 90) ──────────────────────────────────────────────────

/// <param name="Level">support, admin or super.</param>
/// <param name="Reason">Why — kept in the admin trail.</param>
public sealed record SetAdminLevelRequest(string Level, string Reason);

/// <param name="Reason">Why — kept in the admin trail (required, at most 500 characters).</param>
public sealed record AdminUserActionRequest(string Reason);

/// <param name="Reason">Why — kept in the admin trail (required, at most 500 characters).</param>
/// <param name="ClientType">web, mobile or admin; left out — the sessions of every client.</param>
public sealed record AdminRevokeSessionsRequest(string Reason, string? ClientType = null);

public sealed record AdminResponse(
    Guid UserId,
    string Email,
    string Level,
    DateTimeOffset GrantedAt,
    Guid? GrantedBy,
    bool TwoFactorEnabled);

public sealed record AdminListResponse(IReadOnlyList<AdminResponse> Items);

// ── Users in the admin panel (plan 90, phase 6) ──────────────────────────────

/// <summary>One account in the admin user list.</summary>
/// <param name="AdminLevel">Set only for a platform administrator with a level.</param>
/// <param name="LockedUntil">End of a lockout after failed sign-ins still running; null otherwise.</param>
/// <param name="PurgeAt">When a pending deletion erases the account; null without a request.</param>
public sealed record AdminUserListItem(
    Guid Id,
    string Email,
    IReadOnlyList<string> Roles,
    string? AdminLevel,
    bool EmailVerified,
    bool TwoFactorEnabled,
    DateTimeOffset? BlockedAt,
    DateTimeOffset? LockedUntil,
    DateTimeOffset? DeletionRequestedAt,
    DateTimeOffset? PurgeAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset? LastLoginAt);

public sealed record AdminUserListResponse(
    IReadOnlyList<AdminUserListItem> Items,
    int Total,
    int Page,
    int Limit);

/// <summary>An administrator's block of the account; the reason is never shown to its holder.</summary>
public sealed record AdminUserBlockDto(DateTimeOffset At, Guid? By, string? Reason);

/// <summary>Wrong passwords since the last successful sign-in, and the lockout they caused.</summary>
public sealed record AdminUserFailedLoginsDto(
    int Count,
    DateTimeOffset? LastAt,
    DateTimeOffset? LockedUntil);

/// <summary>
/// Wrong two-factor codes on every client (Redis <c>mfa:attempts:&lt;userId&gt;</c>).
/// <c>Available: false</c> when the store could not be read — then the other fields say nothing.
/// </summary>
public sealed record AdminUserMfaCodesDto(
    bool Available,
    int Failures,
    DateTimeOffset? LockedUntil);

public sealed record AdminUserSessionDto(
    DateTimeOffset IssuedAt,
    DateTimeOffset ExpiresAt,
    string? DeviceInfo);

/// <summary>The sessions of one client (`web`, `mobile`, `admin`).</summary>
/// <param name="Active">Sessions open now.</param>
/// <param name="LastIssuedAt">When this client last got a token (sign-in or refresh), revoked or not.</param>
/// <param name="Recent">The three newest open sessions.</param>
public sealed record AdminUserClientSessionsDto(
    string ClientType,
    int Active,
    DateTimeOffset? LastIssuedAt,
    IReadOnlyList<AdminUserSessionDto> Recent);

/// <summary>The card of one account: the list row plus block, lockouts, MFA and sessions.</summary>
public sealed record AdminUserDetailResponse(
    Guid Id,
    string Email,
    IReadOnlyList<string> Roles,
    string? AdminLevel,
    bool EmailVerified,
    bool TwoFactorEnabled,
    DateTimeOffset? BlockedAt,
    DateTimeOffset? LockedUntil,
    DateTimeOffset? DeletionRequestedAt,
    DateTimeOffset? PurgeAt,
    DateTimeOffset CreatedAt,
    DateTimeOffset? LastLoginAt,
    AdminUserBlockDto? Block,
    AdminUserFailedLoginsDto FailedLogins,
    AdminUserMfaCodesDto MfaCodes,
    int BackupCodesLeft,
    IReadOnlyList<AdminUserClientSessionsDto> Sessions);
