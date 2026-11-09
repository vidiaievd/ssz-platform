using AuthService.Application.DTOs;
using AuthService.Application.Interfaces;
using AuthService.Application.Options;
using AuthService.Application.Services;
using AuthService.Domain.Entities;
using AuthService.Domain.Events;
using AuthService.Domain.Exceptions;
using MediatR;
using Microsoft.Extensions.Options;

namespace AuthService.Application.Commands;

// ── Login ─────────────────────────────────────────────────────────────────────

public sealed record LoginCommand(
    string Email,
    string Password,
    string? DeviceInfo = null,
    string? ClientIp = null,
    /// <summary>`web`, `mobile` or `admin` (ADR-012, plan 90); anything else is `web`.</summary>
    string? ClientType = null
) : IRequest<LoginResult>;

// Discriminated union — either full tokens or MFA challenge
public abstract record LoginResult;
public sealed record LoginSuccessResult(AuthTokensResponse Tokens) : LoginResult;
public sealed record MfaRequiredResult(MfaChallengeResponse Challenge) : LoginResult;
/// <summary>
/// Plan 90: an administrator without MFA signing in to the admin panel. The token only lets
/// them set MFA up; it opens no session.
/// </summary>
public sealed record MfaSetupRequiredResult(MfaSetupChallengeResponse Setup) : LoginResult;

public sealed class LoginCommandHandler(
    IUserRepository userRepository,
    IRoleRepository roleRepository,
    IPasswordHasher passwordHasher,
    ITokenService tokenService,
    IDomainEventPublisher eventPublisher,
    IRateLimitStore rateLimitStore,
    IUnitOfWork unitOfWork,
    IOptions<AuthOptions> authOptions,
    IRefreshTokenLifetimeResolver lifetimes,
    IAdminSessionGate adminGate)
    : IRequestHandler<LoginCommand, LoginResult>
{
    public async Task<LoginResult> Handle(LoginCommand command, CancellationToken ct)
    {
        var email = command.Email.Trim().ToLowerInvariant();
        var opts = authOptions.Value;
        var ipKey = command.ClientIp is not null ? $"login:ip:{command.ClientIp}" : null;

        // IP-level rate limiting — checked before DB to stop brute-force bursts
        if (ipKey is not null && await rateLimitStore.IsLockedOutAsync(ipKey, ct))
            throw new AccountLockedException(null);

        var user = await userRepository.FindByEmailAsync(email, ct)
            ?? throw new InvalidCredentialsException();

        // Auto-unlock if lockout period has expired
        user.UnlockIfExpired();

        if (user.IsCurrentlyLocked())
            throw new AccountLockedException(user.LockedUntil);

        if (!passwordHasher.Verify(command.Password, user.PasswordHash))
        {
            user.RecordFailedLogin(opts.MaxFailedLoginAttempts, opts.LockoutDuration);
            await unitOfWork.SaveChangesAsync(ct);

            if (ipKey is not null)
                await rateLimitStore.RecordAttemptAsync(
                    ipKey, opts.LoginRateLimitMaxAttempts, opts.LoginRateLimitWindow, ct);

            throw new InvalidCredentialsException();
        }

        // Success — reset IP rate limit counter
        if (ipKey is not null)
            await rateLimitStore.ResetAsync(ipKey, ct);

        if (!user.EmailVerified)
            throw new EmailNotVerifiedException();

        var clientType = ClientTypes.Normalize(command.ClientType);

        // The admin panel (plan 90) is for administrators with a level, and only through MFA:
        // the gate refuses anyone else, and an administrator without MFA gets no session —
        // only a short-lived token to set MFA up with.
        if (clientType == ClientTypes.Admin)
        {
            var roles = await roleRepository.GetRoleNamesForUserAsync(user.Id, ct);
            await adminGate.RequireLevelAsync(user, roles, ct);

            if (!user.TwoFactorEnabled)
                return new MfaSetupRequiredResult(new MfaSetupChallengeResponse(
                    tokenService.GenerateMfaSetupToken(user.Id),
                    DateTimeOffset.UtcNow.Add(opts.MfaSetupLifetime)));
        }

        // Password valid — check if 2FA is required
        if (user.TwoFactorEnabled)
        {
            var mfaToken = tokenService.GenerateMfaChallengeToken(user.Id);
            return new MfaRequiredResult(new MfaChallengeResponse(
                mfaToken,
                DateTimeOffset.UtcNow.AddMinutes(5)));
        }

        // Unreachable for the admin client — the gate above demands MFA — but never let a
        // password alone open an admin session.
        if (clientType == ClientTypes.Admin)
            throw new MfaSetupRequiredException();

        return await IssueTokensAsync(user, command.DeviceInfo, clientType, ct);
    }

    private async Task<LoginSuccessResult> IssueTokensAsync(
        Domain.Entities.User user,
        string? deviceInfo,
        string clientType,
        CancellationToken ct)
    {
        var roles = await roleRepository.GetRoleNamesForUserAsync(user.Id, ct);
        var opts = authOptions.Value;
        var refreshExpiresAt = DateTimeOffset.UtcNow.Add(
            await lifetimes.ResolveAsync(roles, clientType, ct));

        var accessToken = tokenService.GenerateAccessToken(user.Id, user.Email, roles);
        var (rawRefreshToken, tokenHash, familyId) = tokenService.GenerateRefreshToken();

        var deletionCancelled = user.RecordSuccessfulLogin();
        var refreshToken = user.AddRefreshToken(
            tokenHash,
            familyId,
            refreshExpiresAt,
            deviceInfo,
            clientType);

        userRepository.AddRefreshToken(refreshToken);
        await unitOfWork.SaveChangesAsync(ct);

        foreach (var evt in user.DomainEvents)
            await eventPublisher.PublishAsync(evt, ct);
        user.ClearDomainEvents();

        return new LoginSuccessResult(new AuthTokensResponse(
            accessToken,
            rawRefreshToken,
            DateTimeOffset.UtcNow.Add(opts.AccessTokenLifetime),
            refreshExpiresAt,
            deletionCancelled));
    }
}

// ── Complete MFA login with TOTP code ─────────────────────────────────────────

public sealed record CompleteMfaLoginCommand(
    string MfaChallengeToken,
    string Code,
    string? DeviceInfo = null,
    /// <summary>`web`, `mobile` or `admin` (ADR-012, plan 90); anything else is `web`.</summary>
    string? ClientType = null
) : IRequest<AuthTokensResponse>;

public sealed class CompleteMfaLoginCommandHandler(
    IUserRepository userRepository,
    IRoleRepository roleRepository,
    ITokenService tokenService,
    ITotpService totpService,
    IEncryptionService encryptionService,
    IDomainEventPublisher eventPublisher,
    IOtpReplayGuard replayGuard,
    IUnitOfWork unitOfWork,
    IOptions<AuthOptions> authOptions,
    IRefreshTokenLifetimeResolver lifetimes,
    IAdminSessionGate adminGate,
    IRateLimitStore rateLimitStore)
    : IRequestHandler<CompleteMfaLoginCommand, AuthTokensResponse>
{
    public async Task<AuthTokensResponse> Handle(
        CompleteMfaLoginCommand command,
        CancellationToken ct)
    {
        var userId = tokenService.ValidateMfaChallengeToken(command.MfaChallengeToken)
            ?? throw new InvalidTokenException();

        var user = await userRepository.FindByIdWithTokensAsync(userId, ct)
            ?? throw new UserNotFoundException();

        if (!user.TwoFactorEnabled || user.TotpSecretEncrypted is null)
            throw new DomainException("2FA is not configured.", "MFA_NOT_CONFIGURED");

        var attempts = new AdminMfaAttempts(
            rateLimitStore, authOptions.Value, userId, ClientTypes.Normalize(command.ClientType));
        await attempts.EnsureNotLockedAsync(ct);

        // Replay protection — same code cannot be used twice
        var isReplay = await replayGuard.HasBeenUsedAsync(userId.ToString(), command.Code, ct);
        var secret = encryptionService.Decrypt(user.TotpSecretEncrypted);
        if (isReplay || !totpService.ValidateCode(secret, command.Code))
        {
            await attempts.RecordFailureAsync(ct);
            throw new InvalidTotpCodeException();
        }

        await replayGuard.MarkAsUsedAsync(userId.ToString(), command.Code, ct);
        await attempts.ResetAsync(ct);

        var roles = await roleRepository.GetRoleNamesForUserAsync(userId, ct);
        var opts = authOptions.Value;
        var clientType = ClientTypes.Normalize(command.ClientType);
        // The challenge does not remember the client it was asked from, so the gate runs here
        // again: a challenge from a web sign-in cannot be turned into an admin session.
        var adminLevel = clientType == ClientTypes.Admin
            ? await adminGate.AdmitAsync(user, roles, ct)
            : null;
        var refreshExpiresAt = DateTimeOffset.UtcNow.Add(
            await lifetimes.ResolveAsync(roles, clientType, ct));

        var accessToken = tokenService.GenerateAccessToken(userId, user.Email, roles, adminLevel);
        var (rawRefreshToken, tokenHash, familyId) = tokenService.GenerateRefreshToken();

        var deletionCancelled = user.RecordSuccessfulLogin();
        var refreshToken = user.AddRefreshToken(
            tokenHash,
            familyId,
            refreshExpiresAt,
            command.DeviceInfo,
            clientType);

        userRepository.AddRefreshToken(refreshToken);
        await unitOfWork.SaveChangesAsync(ct);

        foreach (var evt in user.DomainEvents)
            await eventPublisher.PublishAsync(evt, ct);
        user.ClearDomainEvents();

        return new AuthTokensResponse(
            accessToken,
            rawRefreshToken,
            DateTimeOffset.UtcNow.Add(opts.AccessTokenLifetime),
            refreshExpiresAt,
            deletionCancelled);
    }
}

// ── Login with backup code ────────────────────────────────────────────────────

public sealed record LoginWithBackupCodeCommand(
    string MfaChallengeToken,
    string BackupCode,
    string? DeviceInfo = null,
    /// <summary>`web`, `mobile` or `admin` (ADR-012, plan 90); anything else is `web`.</summary>
    string? ClientType = null
) : IRequest<AuthTokensResponse>;

public sealed class LoginWithBackupCodeCommandHandler(
    IUserRepository userRepository,
    IRoleRepository roleRepository,
    ITokenService tokenService,
    IBackupCodeService backupCodeService,
    IDomainEventPublisher eventPublisher,
    IUnitOfWork unitOfWork,
    IOptions<AuthOptions> authOptions,
    IRefreshTokenLifetimeResolver lifetimes,
    IAdminSessionGate adminGate,
    IRateLimitStore rateLimitStore)
    : IRequestHandler<LoginWithBackupCodeCommand, AuthTokensResponse>
{
    public async Task<AuthTokensResponse> Handle(
        LoginWithBackupCodeCommand command,
        CancellationToken ct)
    {
        var userId = tokenService.ValidateMfaChallengeToken(command.MfaChallengeToken)
            ?? throw new InvalidTokenException();

        var user = await userRepository.FindByIdWithBackupCodesAsync(userId, ct)
            ?? throw new UserNotFoundException();

        var attempts = new AdminMfaAttempts(
            rateLimitStore, authOptions.Value, userId, ClientTypes.Normalize(command.ClientType));
        await attempts.EnsureNotLockedAsync(ct);

        // Find matching unused backup code
        var matchingCode = user.BackupCodes
            .Where(c => !c.IsUsed)
            .FirstOrDefault(c => backupCodeService.VerifyCode(command.BackupCode, c.CodeHash));
        if (matchingCode is null)
        {
            await attempts.RecordFailureAsync(ct);
            throw new InvalidTotpCodeException();
        }

        await attempts.ResetAsync(ct);

        user.ConsumeBackupCode(matchingCode.Id);

        var roles = await roleRepository.GetRoleNamesForUserAsync(userId, ct);
        var opts = authOptions.Value;
        var clientType = ClientTypes.Normalize(command.ClientType);
        // The challenge does not remember the client it was asked from, so the gate runs here
        // again: a challenge from a web sign-in cannot be turned into an admin session.
        var adminLevel = clientType == ClientTypes.Admin
            ? await adminGate.AdmitAsync(user, roles, ct)
            : null;
        var refreshExpiresAt = DateTimeOffset.UtcNow.Add(
            await lifetimes.ResolveAsync(roles, clientType, ct));

        var accessToken = tokenService.GenerateAccessToken(userId, user.Email, roles, adminLevel);
        var (rawRefreshToken, tokenHash, familyId) = tokenService.GenerateRefreshToken();

        var deletionCancelled = user.RecordSuccessfulLogin();
        var refreshToken = user.AddRefreshToken(
            tokenHash,
            familyId,
            refreshExpiresAt,
            command.DeviceInfo,
            clientType);

        userRepository.AddRefreshToken(refreshToken);
        await unitOfWork.SaveChangesAsync(ct);

        foreach (var evt in user.DomainEvents)
            await eventPublisher.PublishAsync(evt, ct);
        user.ClearDomainEvents();

        return new AuthTokensResponse(
            accessToken,
            rawRefreshToken,
            DateTimeOffset.UtcNow.Add(opts.AccessTokenLifetime),
            refreshExpiresAt,
            deletionCancelled);
    }
}

// ── Refresh token ─────────────────────────────────────────────────────────────

/// <param name="AdminSession">
/// True on the admin panel's cookie route (plan 90). An admin session refreshes only there,
/// and every other session only on the body route — a token never crosses over.
/// </param>
public sealed record RefreshTokenCommand(
    string RefreshToken,
    bool AdminSession = false
) : IRequest<AuthTokensResponse>;

public sealed class RefreshTokenCommandHandler(
    IUserRepository userRepository,
    IRoleRepository roleRepository,
    IRefreshTokenRepository refreshTokenRepository,
    ITokenService tokenService,
    IUnitOfWork unitOfWork,
    IOptions<AuthOptions> authOptions,
    IRefreshTokenLifetimeResolver lifetimes,
    IAdminSessionGate adminGate)
    : IRequestHandler<RefreshTokenCommand, AuthTokensResponse>
{
    public async Task<AuthTokensResponse> Handle(
        RefreshTokenCommand command,
        CancellationToken ct)
    {
        // Hash incoming token to look it up — raw token is never stored
        var incomingHash = Convert.ToBase64String(
            System.Security.Cryptography.SHA256.HashData(
                System.Text.Encoding.UTF8.GetBytes(command.RefreshToken)));

        var existingToken = await refreshTokenRepository
            .FindActiveByHashAsync(incomingHash, ct)
            ?? throw new InvalidTokenException();

        if ((existingToken.ClientType == ClientTypes.Admin) != command.AdminSession)
            throw new InvalidTokenException();

        var user = await userRepository
            .FindByIdWithTokensAsync(existingToken.UserId, ct)
            ?? throw new UserNotFoundException();

        // Token reuse detected — revoke entire family (theft scenario)
        if (existingToken.IsRevoked)
        {
            user.RevokeRefreshTokenFamily(existingToken.FamilyId);
            await unitOfWork.SaveChangesAsync(ct);
            throw new InvalidTokenException();
        }

        if (existingToken.IsExpired)
            throw new InvalidTokenException();

        var roles = await roleRepository.GetRoleNamesForUserAsync(user.Id, ct);

        // An admin session (plan 90) lives only while its holder is still an administrator
        // with a level and MFA; otherwise the whole session ends here.
        string? adminLevel = null;
        if (existingToken.ClientType == ClientTypes.Admin)
        {
            try
            {
                adminLevel = await adminGate.AdmitAsync(user, roles, ct);
            }
            catch (DomainException)
            {
                user.RevokeRefreshTokenFamily(existingToken.FamilyId);
                await unitOfWork.SaveChangesAsync(ct);
                throw;
            }
        }

        var opts = authOptions.Value;
        // Recomputed on every rotation, from the roles as they are now and the client the
        // session was opened from (ADR-012): a withdrawn role or a changed policy applies at
        // the next refresh, not at the next sign-in.
        var refreshExpiresAt = DateTimeOffset.UtcNow.Add(
            await lifetimes.ResolveAsync(roles, existingToken.ClientType, ct));

        // Rotate — revoke old, issue new in same family
        existingToken.Revoke();
        var (rawRefreshToken, newTokenHash, _) = tokenService.GenerateRefreshToken();
        var refreshToken = user.AddRefreshToken(
            newTokenHash,
            existingToken.FamilyId,
            refreshExpiresAt,
            existingToken.DeviceInfo,
            existingToken.ClientType);

        userRepository.AddRefreshToken(refreshToken);
        var accessToken = tokenService.GenerateAccessToken(user.Id, user.Email, roles, adminLevel);

        await unitOfWork.SaveChangesAsync(ct);

        return new AuthTokensResponse(
            accessToken,
            rawRefreshToken,
            DateTimeOffset.UtcNow.Add(opts.AccessTokenLifetime),
            refreshExpiresAt);
    }
}

// ── Revoke all sessions ───────────────────────────────────────────────────────

public sealed record RevokeAllSessionsCommand(Guid UserId) : IRequest;

public sealed class RevokeAllSessionsCommandHandler(
    IUserRepository userRepository,
    IDomainEventPublisher eventPublisher,
    IUnitOfWork unitOfWork)
    : IRequestHandler<RevokeAllSessionsCommand>
{
    public async Task Handle(RevokeAllSessionsCommand command, CancellationToken ct)
    {
        var user = await userRepository.FindByIdWithTokensAsync(command.UserId, ct)
            ?? throw new UserNotFoundException();

        user.RevokeAllRefreshTokens();
        await unitOfWork.SaveChangesAsync(ct);

        foreach (var evt in user.DomainEvents)
            await eventPublisher.PublishAsync(evt, ct);
        user.ClearDomainEvents();
    }
}

// ── Forgot password ───────────────────────────────────────────────────────────

public sealed record ForgotPasswordCommand(string Email) : IRequest;

public sealed class ForgotPasswordCommandHandler(
    IUserRepository userRepository,
    ITokenService tokenService,
    IDomainEventPublisher eventPublisher,
    IOptions<AuthOptions> authOptions)
    : IRequestHandler<ForgotPasswordCommand>
{
    public async Task Handle(ForgotPasswordCommand command, CancellationToken ct)
    {
        var email = command.Email.Trim().ToLowerInvariant();
        var user = await userRepository.FindByEmailAsync(email, ct);

        // Always return success to prevent user enumeration
        if (user is null) return;

        var opts = authOptions.Value;
        var token = tokenService.GeneratePasswordResetToken(user.Id);
        var resetUrl = $"{opts.AppBaseUrl}/reset-password?token={Uri.EscapeDataString(token)}";

        var domainEvent = new PasswordResetRequestedEvent(
            user.Id,
            user.Email,
            resetUrl,
            opts.PasswordResetTokenLifetimeMinutes);

        await eventPublisher.PublishAsync(domainEvent, ct);
    }
}

// ── Reset password ────────────────────────────────────────────────────────────

public sealed record ResetPasswordCommand(string Token, string NewPassword) : IRequest;

public sealed class ResetPasswordCommandHandler(
    IUserRepository userRepository,
    ITokenService tokenService,
    IPasswordHasher passwordHasher,
    IDomainEventPublisher eventPublisher,
    IUnitOfWork unitOfWork)
    : IRequestHandler<ResetPasswordCommand>
{
    public async Task Handle(ResetPasswordCommand command, CancellationToken ct)
    {
        var userId = tokenService.ValidatePasswordResetToken(command.Token)
            ?? throw new InvalidTokenException();

        var user = await userRepository.FindByIdWithTokensAsync(userId, ct)
            ?? throw new UserNotFoundException();

        var newHash = passwordHasher.Hash(command.NewPassword);
        user.ChangePassword(newHash);

        await unitOfWork.SaveChangesAsync(ct);

        // ChangePassword internally calls RevokeAllRefreshTokens which raises UserLoggedOutEvent
        foreach (var evt in user.DomainEvents)
            await eventPublisher.PublishAsync(evt, ct);
        user.ClearDomainEvents();

        await eventPublisher.PublishAsync(
            new PasswordChangedEvent(user.Id, user.Email), ct);
    }
}

// ── Request email verification ────────────────────────────────────────────────

public sealed record RequestEmailVerificationCommand(Guid UserId, string? Role = null) : IRequest;

public sealed class RequestEmailVerificationCommandHandler(
    IUserRepository userRepository,
    ITokenService tokenService,
    IDomainEventPublisher eventPublisher,
    IOptions<AuthOptions> authOptions)
    : IRequestHandler<RequestEmailVerificationCommand>
{
    public async Task Handle(RequestEmailVerificationCommand command, CancellationToken ct)
    {
        var user = await userRepository.FindByIdAsync(command.UserId, ct)
            ?? throw new UserNotFoundException();

        if (user.EmailVerified) return;

        var opts = authOptions.Value;
        var token = tokenService.GenerateEmailVerificationToken(user.Id, command.Role);
        var verifyUrl = $"{opts.AppBaseUrl}/verify-email?token={Uri.EscapeDataString(token)}";

        await eventPublisher.PublishAsync(
            new EmailVerificationRequestedEvent(
                user.Id,
                user.Email,
                verifyUrl,
                opts.EmailVerificationTokenLifetimeMinutes),
            ct);
    }
}

// ── Verify email ──────────────────────────────────────────────────────────────

public sealed record VerifyEmailCommand(string Token) : IRequest<AuthTokensResponse>;

public sealed class VerifyEmailCommandHandler(
    IUserRepository userRepository,
    IRoleRepository roleRepository,
    ITokenService tokenService,
    IDomainEventPublisher eventPublisher,
    IUnitOfWork unitOfWork,
    IOptions<AuthOptions> authOptions,
    IRefreshTokenLifetimeResolver lifetimes)
    : IRequestHandler<VerifyEmailCommand, AuthTokensResponse>
{
    public async Task<AuthTokensResponse> Handle(VerifyEmailCommand command, CancellationToken ct)
    {
        var data = tokenService.ValidateEmailVerificationToken(command.Token)
            ?? throw new InvalidTokenException();

        var user = await userRepository.FindByIdWithTokensAsync(data.UserId, ct)
            ?? throw new UserNotFoundException();

        if (!user.EmailVerified)
        {
            user.VerifyEmail();
            await eventPublisher.PublishAsync(new EmailVerifiedEvent(user.Id, user.Email), ct);
        }

        var roles = await roleRepository.GetRoleNamesForUserAsync(user.Id, ct);
        var opts = authOptions.Value;
        // The verification link is opened in a browser, so the session it starts is a web one.
        var refreshExpiresAt = DateTimeOffset.UtcNow.Add(
            await lifetimes.ResolveAsync(roles, ClientTypes.Web, ct));

        var accessToken = tokenService.GenerateAccessToken(user.Id, user.Email, roles);
        var (rawRefreshToken, tokenHash, familyId) = tokenService.GenerateRefreshToken();

        var deletionCancelled = user.RecordSuccessfulLogin();
        var refreshToken = user.AddRefreshToken(
            tokenHash,
            familyId,
            refreshExpiresAt);

        userRepository.AddRefreshToken(refreshToken);
        await unitOfWork.SaveChangesAsync(ct);

        foreach (var evt in user.DomainEvents)
            await eventPublisher.PublishAsync(evt, ct);
        user.ClearDomainEvents();

        return new AuthTokensResponse(
            accessToken,
            rawRefreshToken,
            DateTimeOffset.UtcNow.Add(opts.AccessTokenLifetime),
            refreshExpiresAt,
            deletionCancelled);
    }
}