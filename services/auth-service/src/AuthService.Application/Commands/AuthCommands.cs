using AuthService.Application.DTOs;
using AuthService.Application.Interfaces;
using AuthService.Application.Options;
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
    string? ClientIp = null
) : IRequest<LoginResult>;

// Discriminated union — either full tokens or MFA challenge
public abstract record LoginResult;
public sealed record LoginSuccessResult(AuthTokensResponse Tokens) : LoginResult;
public sealed record MfaRequiredResult(MfaChallengeResponse Challenge) : LoginResult;

public sealed class LoginCommandHandler(
    IUserRepository userRepository,
    IRoleRepository roleRepository,
    IPasswordHasher passwordHasher,
    ITokenService tokenService,
    IDomainEventPublisher eventPublisher,
    IRateLimitStore rateLimitStore,
    IUnitOfWork unitOfWork,
    IOptions<AuthOptions> authOptions)
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

        // Password valid — check if 2FA is required
        if (user.TwoFactorEnabled)
        {
            var mfaToken = tokenService.GenerateMfaChallengeToken(user.Id);
            return new MfaRequiredResult(new MfaChallengeResponse(
                mfaToken,
                DateTimeOffset.UtcNow.AddMinutes(5)));
        }

        return await IssueTokensAsync(user, command.DeviceInfo, ct);
    }

    private async Task<LoginSuccessResult> IssueTokensAsync(
        Domain.Entities.User user,
        string? deviceInfo,
        CancellationToken ct)
    {
        var roles = await roleRepository.GetRoleNamesForUserAsync(user.Id, ct);
        var opts = authOptions.Value;

        var accessToken = tokenService.GenerateAccessToken(user.Id, user.Email, roles);
        var (rawRefreshToken, tokenHash, familyId) = tokenService.GenerateRefreshToken();

        user.RecordSuccessfulLogin();
        var refreshToken = user.AddRefreshToken(
            tokenHash,
            familyId,
            DateTimeOffset.UtcNow.Add(opts.RefreshTokenLifetime),
            deviceInfo);

        userRepository.AddRefreshToken(refreshToken);
        await unitOfWork.SaveChangesAsync(ct);

        foreach (var evt in user.DomainEvents)
            await eventPublisher.PublishAsync(evt, ct);
        user.ClearDomainEvents();

        return new LoginSuccessResult(new AuthTokensResponse(
            accessToken,
            rawRefreshToken,
            DateTimeOffset.UtcNow.Add(opts.AccessTokenLifetime),
            DateTimeOffset.UtcNow.Add(opts.RefreshTokenLifetime)));
    }
}

// ── Complete MFA login with TOTP code ─────────────────────────────────────────

public sealed record CompleteMfaLoginCommand(
    string MfaChallengeToken,
    string Code,
    string? DeviceInfo = null
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
    IOptions<AuthOptions> authOptions)
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

        // Replay protection — same code cannot be used twice
        var isReplay = await replayGuard.HasBeenUsedAsync(userId.ToString(), command.Code, ct);
        if (isReplay)
            throw new InvalidTotpCodeException();

        var secret = encryptionService.Decrypt(user.TotpSecretEncrypted);
        if (!totpService.ValidateCode(secret, command.Code))
            throw new InvalidTotpCodeException();

        await replayGuard.MarkAsUsedAsync(userId.ToString(), command.Code, ct);

        var roles = await roleRepository.GetRoleNamesForUserAsync(userId, ct);
        var opts = authOptions.Value;

        var accessToken = tokenService.GenerateAccessToken(userId, user.Email, roles);
        var (rawRefreshToken, tokenHash, familyId) = tokenService.GenerateRefreshToken();

        user.RecordSuccessfulLogin();
        var refreshToken = user.AddRefreshToken(
            tokenHash,
            familyId,
            DateTimeOffset.UtcNow.Add(opts.RefreshTokenLifetime),
            command.DeviceInfo);

        userRepository.AddRefreshToken(refreshToken);
        await unitOfWork.SaveChangesAsync(ct);

        foreach (var evt in user.DomainEvents)
            await eventPublisher.PublishAsync(evt, ct);
        user.ClearDomainEvents();

        return new AuthTokensResponse(
            accessToken,
            rawRefreshToken,
            DateTimeOffset.UtcNow.Add(opts.AccessTokenLifetime),
            DateTimeOffset.UtcNow.Add(opts.RefreshTokenLifetime));
    }
}

// ── Login with backup code ────────────────────────────────────────────────────

public sealed record LoginWithBackupCodeCommand(
    string MfaChallengeToken,
    string BackupCode,
    string? DeviceInfo = null
) : IRequest<AuthTokensResponse>;

public sealed class LoginWithBackupCodeCommandHandler(
    IUserRepository userRepository,
    IRoleRepository roleRepository,
    ITokenService tokenService,
    IBackupCodeService backupCodeService,
    IDomainEventPublisher eventPublisher,
    IUnitOfWork unitOfWork,
    IOptions<AuthOptions> authOptions)
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

        // Find matching unused backup code
        var matchingCode = user.BackupCodes
            .Where(c => !c.IsUsed)
            .FirstOrDefault(c => backupCodeService.VerifyCode(command.BackupCode, c.CodeHash))
            ?? throw new InvalidTotpCodeException();

        user.ConsumeBackupCode(matchingCode.Id);

        var roles = await roleRepository.GetRoleNamesForUserAsync(userId, ct);
        var opts = authOptions.Value;

        var accessToken = tokenService.GenerateAccessToken(userId, user.Email, roles);
        var (rawRefreshToken, tokenHash, familyId) = tokenService.GenerateRefreshToken();

        user.RecordSuccessfulLogin();
        var refreshToken = user.AddRefreshToken(
            tokenHash,
            familyId,
            DateTimeOffset.UtcNow.Add(opts.RefreshTokenLifetime),
            command.DeviceInfo);

        userRepository.AddRefreshToken(refreshToken);
        await unitOfWork.SaveChangesAsync(ct);

        foreach (var evt in user.DomainEvents)
            await eventPublisher.PublishAsync(evt, ct);
        user.ClearDomainEvents();

        return new AuthTokensResponse(
            accessToken,
            rawRefreshToken,
            DateTimeOffset.UtcNow.Add(opts.AccessTokenLifetime),
            DateTimeOffset.UtcNow.Add(opts.RefreshTokenLifetime));
    }
}

// ── Refresh token ─────────────────────────────────────────────────────────────

public sealed record RefreshTokenCommand(
    string RefreshToken
) : IRequest<AuthTokensResponse>;

public sealed class RefreshTokenCommandHandler(
    IUserRepository userRepository,
    IRoleRepository roleRepository,
    IRefreshTokenRepository refreshTokenRepository,
    ITokenService tokenService,
    IUnitOfWork unitOfWork,
    IOptions<AuthOptions> authOptions)
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
        var opts = authOptions.Value;

        // Rotate — revoke old, issue new in same family
        existingToken.Revoke();
        var (rawRefreshToken, newTokenHash, _) = tokenService.GenerateRefreshToken();
        var refreshToken = user.AddRefreshToken(
            newTokenHash,
            existingToken.FamilyId,
            DateTimeOffset.UtcNow.Add(opts.RefreshTokenLifetime));

        userRepository.AddRefreshToken(refreshToken);
        var accessToken = tokenService.GenerateAccessToken(user.Id, user.Email, roles);

        await unitOfWork.SaveChangesAsync(ct);

        return new AuthTokensResponse(
            accessToken,
            rawRefreshToken,
            DateTimeOffset.UtcNow.Add(opts.AccessTokenLifetime),
            DateTimeOffset.UtcNow.Add(opts.RefreshTokenLifetime));
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

public sealed record RequestEmailVerificationCommand(Guid UserId) : IRequest;

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
        var token = tokenService.GenerateEmailVerificationToken(user.Id);
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

public sealed record VerifyEmailCommand(string Token) : IRequest;

public sealed class VerifyEmailCommandHandler(
    IUserRepository userRepository,
    ITokenService tokenService,
    IDomainEventPublisher eventPublisher,
    IUnitOfWork unitOfWork)
    : IRequestHandler<VerifyEmailCommand>
{
    public async Task Handle(VerifyEmailCommand command, CancellationToken ct)
    {
        var userId = tokenService.ValidateEmailVerificationToken(command.Token)
            ?? throw new InvalidTokenException();

        var user = await userRepository.FindByIdAsync(userId, ct)
            ?? throw new UserNotFoundException();

        if (user.EmailVerified) return;

        user.VerifyEmail();
        await unitOfWork.SaveChangesAsync(ct);

        await eventPublisher.PublishAsync(new EmailVerifiedEvent(user.Id, user.Email), ct);
    }
}