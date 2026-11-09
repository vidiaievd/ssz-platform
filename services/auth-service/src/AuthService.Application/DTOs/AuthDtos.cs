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
    IReadOnlyList<TokenLifetimeChange> Policies);

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

public sealed record AdminResponse(
    Guid UserId,
    string Email,
    string Level,
    DateTimeOffset GrantedAt,
    Guid? GrantedBy,
    bool TwoFactorEnabled);

public sealed record AdminListResponse(IReadOnlyList<AdminResponse> Items);
