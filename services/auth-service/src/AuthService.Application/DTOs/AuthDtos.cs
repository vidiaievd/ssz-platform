namespace AuthService.Application.DTOs;

public sealed record RegisterRequest(
    string Email,
    string Password,
    string Role = "student");

public sealed record LoginRequest(
    string Email,
    string Password);

public sealed record MfaChallengeRequest(
    string MfaChallengeToken,
    string Code);

public sealed record BackupCodeLoginRequest(
    string MfaChallengeToken,
    string BackupCode);

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
    DateTimeOffset RefreshTokenExpiresAt);

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