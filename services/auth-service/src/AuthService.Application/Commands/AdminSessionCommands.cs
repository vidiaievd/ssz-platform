using AuthService.Application.DTOs;
using AuthService.Application.Interfaces;
using AuthService.Application.Options;
using AuthService.Application.Services;
using AuthService.Domain.Entities;
using AuthService.Domain.Exceptions;
using MediatR;
using Microsoft.Extensions.Options;

namespace AuthService.Application.Commands;

// ── Admin panel: set MFA up with the setup token (plan 90) ───────────────────

/// <summary>
/// Starts MFA enrolment for an administrator who has none, from the admin panel: the token
/// comes from a correct password and lets them do this and nothing else.
/// </summary>
public sealed record StartAdminMfaSetupCommand(string MfaSetupToken) : IRequest<TotpSetupResponse>;

public sealed class StartAdminMfaSetupCommandHandler(
    IUserRepository userRepository,
    IRoleRepository roleRepository,
    ITokenService tokenService,
    IAdminSessionGate adminGate,
    ISender sender)
    : IRequestHandler<StartAdminMfaSetupCommand, TotpSetupResponse>
{
    public async Task<TotpSetupResponse> Handle(StartAdminMfaSetupCommand command, CancellationToken ct)
    {
        var user = await AdminMfaSetup.ResolveAsync(
            command.MfaSetupToken, tokenService, userRepository, roleRepository, adminGate, ct);

        return await sender.Send(new SetupTotpCommand(user.Id), ct);
    }
}

/// <summary>
/// Finishes MFA enrolment from the admin panel with the first code, and — the code having just
/// proved the second factor — opens the admin session at once.
/// </summary>
public sealed record ConfirmAdminMfaSetupCommand(
    string MfaSetupToken,
    string Code,
    string? DeviceInfo = null
) : IRequest<AdminMfaSetupConfirmedResult>;

public sealed record AdminMfaSetupConfirmedResult(string[] BackupCodes, AuthTokensResponse Tokens);

public sealed class ConfirmAdminMfaSetupCommandHandler(
    IUserRepository userRepository,
    IRoleRepository roleRepository,
    ITokenService tokenService,
    IAdminSessionGate adminGate,
    IOtpReplayGuard replayGuard,
    IRateLimitStore rateLimitStore,
    IDomainEventPublisher eventPublisher,
    IUnitOfWork unitOfWork,
    IOptions<AuthOptions> authOptions,
    IRefreshTokenLifetimeResolver lifetimes,
    ISender sender)
    : IRequestHandler<ConfirmAdminMfaSetupCommand, AdminMfaSetupConfirmedResult>
{
    public async Task<AdminMfaSetupConfirmedResult> Handle(
        ConfirmAdminMfaSetupCommand command,
        CancellationToken ct)
    {
        var opts = authOptions.Value;
        var user = await AdminMfaSetup.ResolveAsync(
            command.MfaSetupToken, tokenService, userRepository, roleRepository, adminGate, ct);

        var attempts = new MfaAttempts(rateLimitStore, opts, user.Id);
        await attempts.EnsureNotLockedAsync(ct);

        if (await replayGuard.HasBeenUsedAsync(user.Id.ToString(), command.Code, ct))
        {
            await attempts.RecordFailureAsync(ct);
            throw new InvalidTotpCodeException();
        }

        Enable2FAResponse enabled;
        try
        {
            // Same unit of work: the user it loads is the instance tracked here.
            enabled = await sender.Send(new VerifyAndEnableTotpCommand(user.Id, command.Code), ct);
        }
        catch (InvalidTotpCodeException)
        {
            await attempts.RecordFailureAsync(ct);
            throw;
        }

        // The enrolment code also signs this session in; it may not do so a second time.
        await replayGuard.MarkAsUsedAsync(user.Id.ToString(), command.Code, ct);
        await attempts.ResetAsync(ct);

        var roles = await roleRepository.GetRoleNamesForUserAsync(user.Id, ct);
        var adminLevel = await adminGate.AdmitAsync(user, roles, ct);
        var refreshExpiresAt = DateTimeOffset.UtcNow.Add(
            await lifetimes.ResolveAsync(roles, ClientTypes.Admin, ct));

        var accessToken = tokenService.GenerateAccessToken(user.Id, user.Email, roles, adminLevel);
        var (rawRefreshToken, tokenHash, familyId) = tokenService.GenerateRefreshToken();

        user.RecordSuccessfulLogin();
        var refreshToken = user.AddRefreshToken(
            tokenHash, familyId, refreshExpiresAt, command.DeviceInfo, ClientTypes.Admin);

        userRepository.AddRefreshToken(refreshToken);
        await unitOfWork.SaveChangesAsync(ct);

        foreach (var evt in user.DomainEvents)
            await eventPublisher.PublishAsync(evt, ct);
        user.ClearDomainEvents();

        return new AdminMfaSetupConfirmedResult(
            enabled.BackupCodes,
            new AuthTokensResponse(
                accessToken,
                rawRefreshToken,
                DateTimeOffset.UtcNow.Add(opts.AccessTokenLifetime),
                refreshExpiresAt));
    }
}

/// <summary>What both setup steps check before touching MFA.</summary>
internal static class AdminMfaSetup
{
    public static async Task<User> ResolveAsync(
        string mfaSetupToken,
        ITokenService tokenService,
        IUserRepository userRepository,
        IRoleRepository roleRepository,
        IAdminSessionGate adminGate,
        CancellationToken ct)
    {
        var userId = tokenService.ValidateMfaSetupToken(mfaSetupToken)
            ?? throw new InvalidTokenException();

        var user = await userRepository.FindByIdWithTokensAsync(userId, ct)
            ?? throw new InvalidTokenException();

        // Someone holding a setup token must not re-enrol an administrator who already has
        // MFA — that would hand the second factor to whoever knows the password.
        if (user.TwoFactorEnabled)
            throw new DomainException(
                "Two-factor authentication is already set up; sign in with a code.",
                "MFA_ALREADY_ENABLED");

        var roles = await roleRepository.GetRoleNamesForUserAsync(userId, ct);
        await adminGate.RequireLevelAsync(user, roles, ct);
        return user;
    }
}

// ── Admin panel: end this session ─────────────────────────────────────────────

/// <summary>
/// Signs the admin panel out: the session behind this refresh token ends. Other sessions of
/// the same person (web, phone) are left alone. Unknown or non-admin tokens are ignored.
/// </summary>
public sealed record EndAdminSessionCommand(string RefreshToken) : IRequest;

public sealed class EndAdminSessionCommandHandler(
    IRefreshTokenRepository refreshTokenRepository,
    IUserRepository userRepository,
    IUnitOfWork unitOfWork)
    : IRequestHandler<EndAdminSessionCommand>
{
    public async Task Handle(EndAdminSessionCommand command, CancellationToken ct)
    {
        var hash = Convert.ToBase64String(
            System.Security.Cryptography.SHA256.HashData(
                System.Text.Encoding.UTF8.GetBytes(command.RefreshToken)));

        var token = await refreshTokenRepository.FindActiveByHashAsync(hash, ct);
        if (token is null || token.ClientType != ClientTypes.Admin) return;

        var user = await userRepository.FindByIdWithTokensAsync(token.UserId, ct);
        if (user is null) return;

        user.RevokeRefreshTokenFamily(token.FamilyId);
        await unitOfWork.SaveChangesAsync(ct);
    }
}
